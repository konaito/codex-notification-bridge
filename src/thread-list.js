const path = require("node:path");
const { rankThreads: rankThreadCandidates } = require("./ranking");

const STATE_LABELS = {
  active: "作業中",
  idle: "待機中",
  notLoaded: "保存済み",
  systemError: "エラー",
};

function statusLabel(status) {
  return STATE_LABELS[status] || "状態不明";
}

function projectFromCwd(cwd) {
  if (typeof cwd !== "string" || !cwd.trim()) return "未分類";
  return path.basename(cwd) || "未分類";
}

function firstLine(value) {
  return typeof value === "string" ? value.split(/\r?\n/, 1)[0].trim() : "";
}

function normalizeThread(thread) {
  const id = typeof thread?.id === "string" ? thread.id.trim() : "";
  const name = typeof thread?.name === "string" ? thread.name.trim() : "";
  const preview = typeof thread?.preview === "string" ? thread.preview.trim() : "";
  const status = typeof thread?.status?.type === "string" ? thread.status.type : "unknown";
  const updatedAt = Number.isFinite(Number(thread?.updatedAt)) ? Number(thread.updatedAt) : 0;

  return {
    id,
    name: name || firstLine(preview) || "名称未設定",
    preview,
    project: projectFromCwd(thread?.cwd),
    status,
    statusLabel: statusLabel(status),
    updatedAt,
    sendable: Boolean(id) && thread?.canAcceptDirectInput !== false,
  };
}

function markConfiguredTarget(thread, target) {
  if (thread?.id !== target?.thread || thread.status === "active") return thread;
  return { ...thread, status: "active", statusLabel: statusLabel("active") };
}

function rankThreads(threads, message, limit = 6) {
  const normalized = threads
    .map(thread => thread?.id && thread?.statusLabel ? thread : normalizeThread(thread))
    .filter(thread => thread.sendable);
  return rankThreadCandidates(normalized, message, limit);
}

module.exports = { markConfiguredTarget, normalizeThread, rankThreads, statusLabel };
