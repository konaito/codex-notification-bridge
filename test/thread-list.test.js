const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeThread,
  markConfiguredTarget,
  rankThreads,
  statusLabel,
} = require("../src/thread-list");

const threads = [
  normalizeThread({
    id: "thread-notification",
    name: "通知の表示位置を調整",
    preview: "通知を右下に表示する",
    cwd: "/Users/konaito/Documents/MiaChat",
    status: { type: "active" },
    updatedAt: 200,
    canAcceptDirectInput: true,
  }),
  normalizeThread({
    id: "thread-history",
    name: "会話履歴の保存を改善",
    preview: "会話履歴の保存方法を見直す",
    cwd: "/Users/konaito/Documents/MiaChat",
    status: { type: "idle" },
    updatedAt: 300,
    canAcceptDirectInput: true,
  }),
];

test("normalizes a Codex thread into a sendable list row", () => {
  assert.deepEqual(normalizeThread({
    id: "thread-1",
    name: "  タスク名  ",
    preview: "最初のメッセージ",
    cwd: "/Users/konaito/Documents/project-a",
    status: { type: "active", activeFlags: [] },
    updatedAt: 123,
    canAcceptDirectInput: null,
  }), {
    id: "thread-1",
    name: "タスク名",
    preview: "最初のメッセージ",
    project: "project-a",
    status: "active",
    statusLabel: "作業中",
    updatedAt: 123,
    sendable: true,
  });
});

test("does not mark an explicitly unavailable thread as sendable", () => {
  assert.equal(normalizeThread({ id: "thread-2", canAcceptDirectInput: false }).sendable, false);
});

test("marks the configured parent task as active when app-server has not loaded it", () => {
  const thread = normalizeThread({
    id: "thread-current",
    name: "現在の作業",
    status: { type: "notLoaded" },
    canAcceptDirectInput: true,
  });
  assert.deepEqual(markConfiguredTarget(thread, { thread: "thread-current" }), {
    ...thread,
    status: "active",
    statusLabel: "作業中",
  });
});

test("ranks the likely destination from the message text", () => {
  const ranked = rankThreads(threads, "通知を右下に表示して");
  assert.equal(ranked[0].id, "thread-notification");
  assert.equal(ranked.length, 1);
  assert.ok(ranked[0].matchScore > 0);
});

test("prefers specific task words over generic preview words", () => {
  const ranked = rankThreads([
    normalizeThread({ id: "specific", name: "Fix Quick Share permission flow", preview: "許可フローを修正する", updatedAt: 200 }),
    normalizeThread({ id: "generic", name: "検索機能を確認", preview: "内容を確認して", updatedAt: 100 }),
  ], "Quick Shareの許可フローを確認して");
  assert.equal(ranked[0].id, "specific");
});

test("removes non-matching threads once a message has a meaningful token", () => {
  const ranked = rankThreads(threads, "通知");
  assert.deepEqual(ranked.map(thread => thread.id), ["thread-notification"]);
});

test("exposes stable Japanese labels for thread states", () => {
  assert.equal(statusLabel("active"), "作業中");
  assert.equal(statusLabel("idle"), "待機中");
  assert.equal(statusLabel("notLoaded"), "保存済み");
  assert.equal(statusLabel("systemError"), "エラー");
});
