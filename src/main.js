const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { queueToCodex } = require("./codex");
const { DEFAULT_LONG_PRESS_MS, createLongPressRecognizer } = require("./command-long-press");
const { predictTarget } = require("./codex-predict");
const { listThreads, readThreadTurns } = require("./codex-server");
const { extractThreadContext } = require("./thread-context");
const { markConfiguredTarget, normalizeThread } = require("./thread-list");
const { getConfiguredTarget } = require("./target");

let currentThreads = [];
let activePrediction = null;
let threadContextPromise = null;
let threadContextLoadedAt = 0;
let threadContextSource = "metadata";
let threadContextError = "";
let mainWindow = null;
let commandMonitorProcess = null;
let pendingComposerFocus = false;
let shortcutStatus = { available: false, message: "左⌘ショートカットを準備中…" };
const THREAD_CONTEXT_CACHE_MS = 30_000;

function invalidateThreadContext() {
  threadContextPromise = null;
  threadContextLoadedAt = 0;
  threadContextSource = "metadata";
  threadContextError = "";
}

function ensureThreadContexts() {
  const now = Date.now();
  if (threadContextPromise) return threadContextPromise;
  if (threadContextLoadedAt && now - threadContextLoadedAt < THREAD_CONTEXT_CACHE_MS) return Promise.resolve(currentThreads);
  if (!currentThreads.length) return Promise.resolve(currentThreads);

  const sourceThreads = currentThreads;
  threadContextPromise = readThreadTurns(sourceThreads.map(thread => thread.id), { limit: 4 })
    .then(({ threads, errors }) => {
      const byId = new Map(threads.map(thread => [thread.id, thread]));
      let availableCount = 0;
      currentThreads = sourceThreads.map(thread => {
        const context = extractThreadContext(byId.get(thread.id));
        if (context.available) availableCount += 1;
        return { ...thread, currentState: context };
      });
      threadContextSource = availableCount === sourceThreads.length
        ? "thread"
        : availableCount > 0 ? "partial" : "metadata";
      threadContextError = errors.length ? `${errors.length}件のタスク履歴を取得できませんでした。` : "";
      threadContextLoadedAt = Date.now();
      return currentThreads;
    })
    .catch(error => {
      threadContextSource = "metadata";
      threadContextError = error.message;
      threadContextLoadedAt = Date.now();
      return currentThreads;
    })
    .finally(() => {
      threadContextPromise = null;
    });
  return threadContextPromise;
}

function publishShortcutStatus(status) {
  shortcutStatus = status;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return;
  mainWindow.webContents.send("codex:shortcut-status", status);
}

function focusComposer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  pendingComposerFocus = true;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (process.platform === "darwin") app.focus({ steal: true });
  mainWindow.show();
  mainWindow.focus();
  if (mainWindow.webContents.isLoading()) return;
  pendingComposerFocus = false;
  mainWindow.webContents.focus();
  mainWindow.webContents.send("codex:focus-composer");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 700,
    minWidth: 620,
    minHeight: 520,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("codex:shortcut-status", shortcutStatus);
    if (pendingComposerFocus) focusComposer();
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  return mainWindow;
}

function commandMonitorBinaryPath() {
  const binaryPath = path.join(app.getPath("userData"), "codex-left-command-monitor");
  const sourcePath = path.join(__dirname, "macos-command-monitor.swift");
  const sourceMtime = fs.statSync(sourcePath).mtimeMs;
  let binaryMtime = 0;
  try {
    binaryMtime = fs.statSync(binaryPath).mtimeMs;
  } catch {
    // The helper is compiled on first launch.
  }
  if (binaryMtime < sourceMtime) {
    execFileSync("swiftc", ["-O", sourcePath, "-o", binaryPath], { stdio: "pipe" });
  }
  return binaryPath;
}

function startCommandMonitor() {
  if (process.platform !== "darwin") return;
  try {
    const binaryPath = commandMonitorBinaryPath();
    commandMonitorProcess = spawn(binaryPath, [], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    commandMonitorProcess.stdout.setEncoding("utf8");
    commandMonitorProcess.stdout.on("data", chunk => {
      output += chunk;
      const lines = output.split("\n");
      output = lines.pop() || "";
      for (const line of lines) {
        if (line === "ready") publishShortcutStatus({ available: true, message: "" });
        else if (line === "down") commandPressRecognizer.handle("down");
        else if (line === "cancel") commandPressRecognizer.handle("cancel");
        else if (line === "up") commandPressRecognizer.handle("up");
      }
    });
    commandMonitorProcess.stderr.setEncoding("utf8");
    commandMonitorProcess.stderr.on("data", message => console.error(message.trim()));
    commandMonitorProcess.on("error", error => {
      publishShortcutStatus({ available: false, message: `左⌘ショートカットを開始できませんでした: ${error.message}` });
    });
    commandMonitorProcess.on("exit", code => {
      commandMonitorProcess = null;
      if (code === 2) {
        publishShortcutStatus({ available: false, message: "左⌘ショートカットにはアクセシビリティ許可が必要です。" });
      } else if (code !== 0) {
        publishShortcutStatus({ available: false, message: "左⌘ショートカットを利用できません。" });
      }
    });
  } catch (error) {
    publishShortcutStatus({ available: false, message: `左⌘ショートカットを準備できませんでした: ${error.message}` });
  }
}

function stopCommandMonitor() {
  if (commandMonitorProcess && !commandMonitorProcess.killed) commandMonitorProcess.kill();
  commandMonitorProcess = null;
}

const commandPressRecognizer = createLongPressRecognizer({
  delayMs: DEFAULT_LONG_PRESS_MS,
  onLongPress: focusComposer,
});

app.whenReady().then(() => {
  ipcMain.handle("codex:queue", async (_event, payload) => {
    const result = await queueToCodex(payload);
    invalidateThreadContext();
    return result;
  });
  ipcMain.handle("codex:threads:list", async () => {
    const threads = await listThreads();
    const configuredTarget = getConfiguredTarget();
    currentThreads = threads.map(normalizeThread).map(thread => markConfiguredTarget(thread, configuredTarget)).filter(thread => thread.sendable);
    invalidateThreadContext();
    return currentThreads;
  });
  ipcMain.handle("codex:threads:predict", async (_event, payload) => {
    if (activePrediction) activePrediction.abort();
    const controller = new AbortController();
    activePrediction = controller;
    const threads = await ensureThreadContexts();
    return predictTarget(payload?.message, threads, { signal: controller.signal }).then(result => ({
      ...result,
      contextSource: threadContextSource,
      contextError: threadContextError,
    })).finally(() => {
      if (activePrediction === controller) activePrediction = null;
    });
  });
  ipcMain.handle("codex:target", () => getConfiguredTarget());
  createWindow();
  startCommandMonitor();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("will-quit", stopCommandMonitor);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

module.exports = { queueToCodex };
