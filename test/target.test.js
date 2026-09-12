const test = require("node:test");
const assert = require("node:assert/strict");
const { getConfiguredTarget, describeTarget } = require("../src/target");

test("reads the configured Codex target from the environment", () => {
  assert.deepEqual(
    getConfiguredTarget({
      CODEX_TARGET_THREAD: "  01abc  ",
      CODEX_TARGET_NAME: "  現在のCodexタスク  ",
    }),
    { thread: "01abc", name: "現在のCodexタスク" },
  );
});

test("returns no target when the thread is not configured", () => {
  assert.equal(getConfiguredTarget({ CODEX_TARGET_NAME: "名前だけ" }), null);
});

test("describes a configured target for the UI", () => {
  assert.equal(
    describeTarget({ thread: "01abc", name: "現在のCodexタスク" }),
    "現在のCodexタスク（01abc）",
  );
  assert.equal(describeTarget({ thread: "01abc", name: "" }), "01abc");
});
