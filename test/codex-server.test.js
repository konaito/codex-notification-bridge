const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildThreadTurnsListParams,
  buildThreadListParams,
  parseServerLine,
} = require("../src/codex-server");

test("builds the app-server thread list request", () => {
  assert.deepEqual(buildThreadListParams(50), {
    archived: false,
    limit: 50,
    sortKey: "updated_at",
    sortDirection: "desc",
  });
});

test("builds a recent thread-content request instead of hydrating full history", () => {
  assert.deepEqual(buildThreadTurnsListParams("thread-1", 4), {
    threadId: "thread-1",
    limit: 4,
    sortDirection: "desc",
    itemsView: "full",
  });
});

test("parses JSON-RPC lines and ignores malformed output", () => {
  assert.deepEqual(parseServerLine('{"id":2,"result":{"data":[]}}'), {
    id: 2,
    result: { data: [] },
  });
  assert.equal(parseServerLine("not-json"), null);
});
