const test = require("node:test");
const assert = require("node:assert/strict");
const { extractThreadContext } = require("../src/thread-context");

test("extracts the latest user request, assistant state, and unfinished work", () => {
  const context = extractThreadContext({
    turns: [
      {
        id: "older-turn",
        startedAt: 100,
        completedAt: 110,
        status: "completed",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "前の依頼" }] },
          { type: "agentMessage", id: "a1", text: "前の対応は完了しました。" },
        ],
      },
      {
        id: "latest-turn",
        startedAt: 200,
        completedAt: null,
        status: "inProgress",
        items: [
          { type: "userMessage", id: "u2", content: [{ type: "text", text: "許可フローを直して" }] },
          { type: "commandExecution", id: "c1", command: "npm test", status: "inProgress", aggregatedOutput: "テストを実行中" },
          { type: "agentMessage", id: "a2", text: "実装は済みました。次はテストを確認します。" },
        ],
      },
    ],
  });

  assert.equal(context.lastTurnStatus, "inProgress");
  assert.equal(context.lastUserMessage, "許可フローを直して");
  assert.equal(context.lastAssistantMessage, "実装は済みました。次はテストを確認します。");
  assert.deepEqual(context.recentItems, [
    { role: "user", type: "userMessage", text: "前の依頼" },
    { role: "assistant", type: "agentMessage", text: "前の対応は完了しました。" },
    { role: "user", type: "userMessage", text: "許可フローを直して" },
    { role: "tool", type: "commandExecution", text: "npm test\nテストを実行中", status: "inProgress" },
    { role: "assistant", type: "agentMessage", text: "実装は済みました。次はテストを確認します。" },
  ]);
});

test("does not leak internal reasoning and reports missing history explicitly", () => {
  assert.deepEqual(extractThreadContext({ turns: [] }), {
    available: false,
    lastTurnStatus: null,
    lastUserMessage: "",
    lastAssistantMessage: "",
    recentItems: [],
  });
  assert.deepEqual(extractThreadContext({
    turns: [{
      status: "completed",
      items: [
        { type: "reasoning", id: "r1", summary: ["内部推論"] },
        { type: "plan", id: "p1", text: "画面を確認する" },
      ],
    }],
  }).recentItems, [
    { role: "assistant", type: "plan", text: "画面を確認する" },
  ]);
});
