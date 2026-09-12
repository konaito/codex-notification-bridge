const { spawn } = require("node:child_process");

const DEFAULT_LIMIT = 100;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_TURNS_LIMIT = 4;

function buildThreadListParams(limit = DEFAULT_LIMIT) {
  return {
    archived: false,
    limit,
    sortKey: "updated_at",
    sortDirection: "desc",
  };
}

function buildThreadTurnsListParams(threadId, limit = DEFAULT_TURNS_LIMIT) {
  return {
    threadId,
    limit,
    sortDirection: "desc",
    itemsView: "full",
  };
}

function parseServerLine(line) {
  try {
    const value = JSON.parse(line);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function requestAppServer(requests, { command = process.env.CODEX_BIN || "codex", timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, ["app-server", "--listen", "stdio://"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      reject(new Error(`Codex app-serverを起動できませんでした: ${error.message}`));
      return;
    }

    let buffer = "";
    let stderr = "";
    let settled = false;
    let requestId = 0;
    let initializationId = 0;
    let pending = new Map();
    let responses = new Array(requests.length);
    let completed = 0;
    const timeout = setTimeout(() => finishError(new Error("Codexのタスク情報取得がタイムアウトしました。")), timeoutMs);

    function closeChild() {
      clearTimeout(timeout);
      if (!child.killed) child.kill("SIGTERM");
    }

    function finishError(error) {
      if (settled) return;
      settled = true;
      closeChild();
      const detail = stderr.trim();
      reject(detail ? new Error(`${error.message} ${detail}`) : error);
    }

    function finishSuccess(data) {
      if (settled) return;
      settled = true;
      closeChild();
      resolve(Array.isArray(data) ? data : []);
    }

    function finishResponses() {
      if (completed === requests.length) finishSuccess(responses);
    }

    function send(method, params) {
      requestId += 1;
      child.stdin.write(`${JSON.stringify({ id: requestId, method, params })}\n`);
      return requestId;
    }

    child.stdout.on("data", chunk => {
      buffer += chunk.toString();
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        const response = parseServerLine(line);
        if (!response || response.id === undefined) continue;
        if (response.error) {
          if (response.id === initializationId) {
            finishError(new Error(response.error.message || "Codex app-serverが初期化エラーを返しました。"));
            continue;
          }
          const request = pending.get(response.id);
          if (request) {
            responses[request.index] = { error: new Error(response.error.message || "Codex app-serverがエラーを返しました。") };
            pending.delete(response.id);
            completed += 1;
            finishResponses();
          }
          continue;
        }
        if (response.id === initializationId) {
          requests.forEach((request, index) => {
            const id = send(request.method, request.params);
            pending.set(id, { index });
          });
          if (!requests.length) finishSuccess([]);
          continue;
        }
        const request = pending.get(response.id);
        if (request) {
          responses[request.index] = { result: response.result };
          pending.delete(response.id);
          completed += 1;
          finishResponses();
        }
      }
    });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => finishError(new Error(`Codex app-serverを起動できませんでした: ${error.message}`)));
    child.on("close", code => {
      if (!settled && code !== 0) finishError(new Error(`Codex app-serverが終了しました（終了コード ${code}）。`));
      else if (!settled) finishError(new Error("Codex app-serverが予期せず終了しました。"));
    });

    if (signal) {
      const abort = () => finishError(new Error("Codex app-serverの取得をキャンセルしました。"));
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    }
    initializationId = send("initialize", {
      clientInfo: {
        name: "codex-notification-bridge",
        title: "Codex Notification Bridge",
        version: "0.1.0",
      },
    });
  });
}

function listThreads({ command = process.env.CODEX_BIN || "codex", limit = DEFAULT_LIMIT, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return requestAppServer([{ method: "thread/list", params: buildThreadListParams(limit) }], { command, timeoutMs })
    .then(responses => {
      const response = responses[0];
      if (response?.error) throw response.error;
      return response?.result?.data || [];
    });
}

async function readThreadTurns(threadIds, options = {}) {
  const ids = [...new Set((Array.isArray(threadIds) ? threadIds : []).filter(id => typeof id === "string" && id.trim()))];
  if (!ids.length) return { threads: [], errors: [] };
  const responses = await requestAppServer(ids.map(threadId => ({
    method: "thread/turns/list",
    params: buildThreadTurnsListParams(threadId, options.limit || DEFAULT_TURNS_LIMIT),
  })), options);
  const threads = [];
  const errors = [];
  responses.forEach((response, index) => {
    if (response?.error) {
      errors.push({ id: ids[index], error: response.error });
      return;
    }
    threads.push({ id: ids[index], turns: response?.result?.data || [] });
  });
  return { threads, errors };
}

module.exports = { buildThreadListParams, buildThreadTurnsListParams, listThreads, parseServerLine, readThreadTurns, requestAppServer };
