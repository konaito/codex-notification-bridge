const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPredictionArgs,
  buildPredictionPrompt,
  resolvePredictionConfig,
  parsePredictionText,
  selectPredictionCandidates,
} = require("../src/codex-predict");
const {
  ORCHESTRATION_WEIGHTS,
  orchestrationFeatures,
  rankWithOrchestration,
} = require("../src/orchestration");

const threads = [
  { id: "a", project: "MiaChat", name: "通知の表示位置を調整", preview: "通知を右下に表示する", updatedAt: 20, status: "active", sendable: true },
  { id: "b", project: "FYBE", name: "トップページを作成", preview: "ページを作る", updatedAt: 10, status: "idle", sendable: true },
  { id: "blocked", project: "Hidden", name: "送信不可", preview: "", updatedAt: 30, sendable: false },
];

test("builds a semantic routing prompt with candidate data boundaries", () => {
  const prompt = buildPredictionPrompt("通知の位置を変えて", [
    {
      ...threads[0],
      currentState: {
        available: true,
        lastTurnStatus: "inProgress",
        lastUserMessage: "通知を右下にして",
        lastAssistantMessage: "実装は済みました。次にテストを確認します。",
        recentItems: [
          { role: "user", type: "userMessage", text: "通知を右下にして" },
          { role: "assistant", type: "agentMessage", text: "実装は済みました。次にテストを確認します。" },
        ],
      },
    },
    ...threads.slice(1),
  ]);
  assert.match(prompt, /意味/);
  assert.match(prompt, /未信頼のデータ/);
  assert.match(prompt, /lastInteractionAt/);
  assert.match(prompt, /lastUserMessage/);
  assert.match(prompt, /lastAssistantMessage/);
  assert.match(prompt, /recentItems/);
  assert.match(prompt, /実装は済みました。次にテストを確認します。/);
  assert.match(prompt, /inProgress/);
  assert.match(prompt, /semantic 60%/);
  assert.match(prompt, /通知の表示位置を調整/);
  assert.doesNotMatch(prompt, /送信不可/);
});

test("selects recent sendable candidates and compacts their fields", () => {
  assert.deepEqual(selectPredictionCandidates(threads, 100, 20), [
    {
      id: "a",
      project: "MiaChat",
      name: "通知の表示位置を調整",
      preview: "通知を右下に表示する",
      status: "active",
      lastInteractionAt: 20,
      secondsSinceLastInteraction: 0,
      recencyScore: 1,
      currentState: {
        available: false,
        lastTurnStatus: null,
        lastUserMessage: "",
        lastAssistantMessage: "",
        recentItems: [],
      },
    },
    {
      id: "b",
      project: "FYBE",
      name: "トップページを作成",
      preview: "ページを作る",
      status: "idle",
      lastInteractionAt: 10,
      secondsSinceLastInteraction: 10,
      recencyScore: Math.exp(-10 / 86_400),
      currentState: {
        available: false,
        lastTurnStatus: null,
        lastUserMessage: "",
        lastAssistantMessage: "",
        recentItems: [],
      },
    },
  ]);
});

test("builds an ephemeral read-only Codex exec command", () => {
  assert.deepEqual(buildPredictionArgs("prompt", {
    outputPath: "/tmp/result.json",
    schemaPath: "/tmp/schema.json",
    workdir: "/tmp",
  }), [
    "exec", "--ephemeral", "--skip-git-repo-check", "-C", "/tmp", "-s", "read-only",
    "--color", "never", "--output-schema", "/tmp/schema.json", "--output-last-message", "/tmp/result.json", "prompt",
  ]);
});

test("passes the selected model and reasoning effort to Codex", () => {
  assert.deepEqual(buildPredictionArgs("prompt", {
    outputPath: "/tmp/result.json",
    schemaPath: "/tmp/schema.json",
    workdir: "/tmp",
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
  }).slice(-5), [
    "--model", "gpt-5.6-luna",
    "--config", 'model_reasoning_effort="low"',
    "prompt",
  ]);
  assert.match(buildPredictionArgs("prompt", {
    outputPath: "/tmp/result.json",
    schemaPath: "/tmp/schema.json",
    workdir: "/tmp",
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
  }).join(" "), /--config model_reasoning_effort="low"/);
});

test("defaults prediction routing to the fast model and low effort", () => {
  assert.deepEqual(resolvePredictionConfig({}), { model: "gpt-5.6-terra", reasoningEffort: "low" });
  assert.deepEqual(resolvePredictionConfig({ model: "gpt-5.6-terra", reasoningEffort: "medium" }), { model: "gpt-5.6-terra", reasoningEffort: "medium" });
});

test("parses structured Codex output and discards unknown ids", () => {
  assert.deepEqual(parsePredictionText('```json\n{"rankedCandidates":[{"id":"unknown","semanticScore":1,"reason":"無視"},{"id":"b","semanticScore":0.8,"reason":"意味が近い"},{"id":"b","semanticScore":0.7,"reason":"重複"},{"id":"a","semanticScore":1.4,"reason":"別の意味が近い"}],"confidence":1.4,"reason":"分類結果"}\n```', ["a", "b"]), {
    rankedCandidates: [
      { id: "b", semanticScore: 0.8, reason: "意味が近い" },
      { id: "a", semanticScore: 1, reason: "別の意味が近い" },
    ],
    confidence: 1,
    reason: "分類結果",
  });
});

test("exposes recency and state features for every task", () => {
  assert.deepEqual(orchestrationFeatures({ updatedAt: 950, status: "active" }, 1000), {
    lastInteractionAt: 950,
    secondsSinceLastInteraction: 50,
    recencyScore: Math.exp(-50 / 86_400),
    statusScore: 1,
  });
});

test("combines semantic relevance, recency, and task state", () => {
  const ranked = rankWithOrchestration([
    { id: "old", updatedAt: 0, status: "idle", sendable: true },
    { id: "recent", updatedAt: 995, status: "active", sendable: true },
  ], [
    { id: "old", semanticScore: 0.9, reason: "内容が近い" },
    { id: "recent", semanticScore: 0.7, reason: "最近の作業" },
  ], 2, 1000);
  assert.equal(ranked[0].id, "recent");
  assert.equal(ORCHESTRATION_WEIGHTS.semantic + ORCHESTRATION_WEIGHTS.recency + ORCHESTRATION_WEIGHTS.status, 1);
});
