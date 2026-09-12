const test = require("node:test");
const assert = require("node:assert/strict");
const { validateQueuePayload } = require("../src/validation");

test("trims and returns a valid queue payload", () => {
  assert.deepEqual(
    validateQueuePayload({ thread: "  task-name  ", message: "  hello  " }),
    { thread: "task-name", message: "hello" },
  );
});

test("rejects missing thread or message", () => {
  assert.throws(() => validateQueuePayload({ thread: "", message: "hello" }), /対象タスク/);
  assert.throws(() => validateQueuePayload({ thread: "task", message: " " }), /通知内容/);
  assert.throws(() => validateQueuePayload(null), /入力/);
});

test("rejects values over the documented limits", () => {
  assert.throws(() => validateQueuePayload({ thread: "x".repeat(201), message: "hello" }), /200/);
  assert.throws(() => validateQueuePayload({ thread: "task", message: "x".repeat(10001) }), /10000/);
});
