const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { queueToCodex } = require("./codex");
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

function createWindow() {
  const window = new BrowserWindow({
    width: 720,
    height: 520,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(path.join(__dirname, "index.html"));
}

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
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

module.exports = { queueToCodex };
