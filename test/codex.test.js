const test = require("node:test");
const assert = require("node:assert/strict");
const { buildQueueArgs, queueToCodex } = require("../src/codex");

test("builds the documented Codex queue arguments", () => {
  assert.deepEqual(
    buildQueueArgs({ thread: "task name", message: "hello from the bridge" }),
    ["queue", "--thread", "task name", "--message", "hello from the bridge"],
  );
});

test("runs the Codex command and resolves on success", async () => {
  assert.deepEqual(
    await queueToCodex({ thread: "task", message: "hello" }, { command: "/usr/bin/true" }),
    { ok: true },
  );
});

test("returns a useful error when Codex exits unsuccessfully", async () => {
  await assert.rejects(
    queueToCodex({ thread: "task", message: "hello" }, { command: "/usr/bin/false" }),
    /Codexへの送信に失敗しました/,
  );
});

test("returns a useful error when the Codex executable cannot start", async () => {
  await assert.rejects(
    queueToCodex({ thread: "task", message: "hello" }, { command: "/definitely/missing/codex" }),
    /Codexを起動できませんでした/,
  );
});
