const { performance } = require("node:perf_hooks");
const { predictTarget } = require("../src/codex-predict");

const BENCHMARK_TIMEOUT_MS = 45_000;

function currentState(lastUserMessage, lastAssistantMessage, toolText = "") {
  const recentItems = [
    { role: "user", type: "userMessage", text: lastUserMessage },
    { role: "assistant", type: "agentMessage", text: lastAssistantMessage },
  ];
  if (toolText) recentItems.push({ role: "tool", type: "commandExecution", text: toolText, status: "completed" });
  return {
    available: true,
    lastTurnStatus: "completed",
    lastUserMessage,
    lastAssistantMessage,
    recentItems,
  };
}

function buildBenchmarkThreads() {
  const updatedAt = Math.floor(Date.now() / 1000);
  return [
    {
      id: "quick-share",
      project: "n",
      name: "Fix Quick Share permission flow",
      preview: "Quick Shareの受信許可とDownloads保存を直す",
      status: "idle",
      updatedAt,
      sendable: true,
      currentState: currentState("Quick Shareで受け入れるを押した後、Downloadsへ直接保存したい", "受信通知の許可処理と実ファイル保存を確認しました。", "npm test -- quick-share"),
    },
    {
      id: "karaoke-ui",
      project: "karaoke",
      name: "カラオケUIを全面刷新",
      preview: "スクロールなしで見切れない採点画面にする",
      status: "idle",
      updatedAt,
      sendable: true,
      currentState: currentState("採点カラオケらしい画面に作り直して", "歌唱画面のレイアウトとスクロール問題を整理しました。", "npm run test:ui"),
    },
    {
      id: "notification-bridge",
      project: "codex-notification-bridge",
      name: "Codexタスクの返答先予測",
      preview: "会話文脈を使ってCodexタスクへメッセージを挿入する",
      status: "idle",
      updatedAt,
      sendable: true,
      currentState: currentState("スレッドの中身の現在地も予測に渡したい", "直近ターンと作業状態を取得してルーターへ渡しました。", "npm test"),
    },
    {
      id: "mia-knowledge",
      project: "imichat2b",
      name: "Locate knowledge機能",
      preview: "Miaのknowledge機能が存在するか確認する",
      status: "idle",
      updatedAt,
      sendable: true,
      currentState: currentState("knowledgeってあると思うんだけど理解できる？", "knowledge関連の実装と保存場所を調べています。"),
    },
    {
      id: "pokemon-season",
      project: "pokemon-champion",
      name: "現シーズンの使用率を取得",
      preview: "現在の環境と使用率を調査してパーティを考える",
      status: "idle",
      updatedAt,
      sendable: true,
      currentState: currentState("今シーズンの使用率を調べて", "現行シーズンの環境データを確認しています。"),
    },
    {
      id: "note-article",
      project: "note",
      name: "愛を伝えるnoteを書く",
      preview: "AI時代についてのnote記事を作る",
      status: "idle",
      updatedAt,
      sendable: true,
      currentState: currentState("AI時代について本気のnoteを書いて", "記事の冒頭とフックを組み直しています。"),
    },
  ];
}

const CASES = [
  { name: "Quick Shareの受信許可を直してDownloadsへ保存", expectedId: "quick-share" },
  { name: "カラオケの採点画面をスクロールなしで見切れなくして", expectedId: "karaoke-ui" },
  { name: "この通知ブリッジの返答先予測にモデルとeffortを追加して", expectedId: "notification-bridge" },
  { name: "Miaのknowledge機能がどうなっているか確認して", expectedId: "mia-knowledge" },
  { name: "ポケモンの現シーズンの使用率を調べて", expectedId: "pokemon-season" },
];

const CONFIGS = [
  { label: "luna/low", model: "gpt-5.6-luna", reasoningEffort: "low" },
  { label: "luna/medium", model: "gpt-5.6-luna", reasoningEffort: "medium" },
  { label: "terra/low", model: "gpt-5.6-terra", reasoningEffort: "low" },
];

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function runConfig(config, threads) {
  const results = [];
  for (const benchmarkCase of CASES) {
    const started = performance.now();
    try {
      const prediction = await predictTarget(benchmarkCase.name, threads, {
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        timeoutMs: BENCHMARK_TIMEOUT_MS,
      });
      const rankedIds = prediction.rankedIds || [];
      results.push({
        case: benchmarkCase.name,
        expectedId: benchmarkCase.expectedId,
        top1: rankedIds[0] === benchmarkCase.expectedId,
        top3: rankedIds.slice(0, 3).includes(benchmarkCase.expectedId),
        latencyMs: Math.round(performance.now() - started),
        structured: true,
        predictedIds: rankedIds.slice(0, 3),
      });
    } catch (error) {
      results.push({
        case: benchmarkCase.name,
        expectedId: benchmarkCase.expectedId,
        top1: false,
        top3: false,
        latencyMs: Math.round(performance.now() - started),
        structured: false,
        error: error.message,
      });
    }
  }
  const latencies = results.filter(result => result.structured).map(result => result.latencyMs);
  return {
    ...config,
    cases: results,
    top1Accuracy: results.filter(result => result.top1).length / CASES.length,
    top3Accuracy: results.filter(result => result.top3).length / CASES.length,
    structuredRate: results.filter(result => result.structured).length / CASES.length,
    medianLatencyMs: median(latencies),
  };
}

function printReport(report) {
  console.log("\nCodex routing benchmark");
  console.log(`${CASES.length} cases / identical thread context / sequential runs`);
  console.log("model/effort        Top-1   Top-3   JSON     p50 latency");
  for (const result of report) {
    console.log(`${result.label.padEnd(19)} ${Math.round(result.top1Accuracy * 100).toString().padStart(3)}%    ${Math.round(result.top3Accuracy * 100).toString().padStart(3)}%    ${Math.round(result.structuredRate * 100).toString().padStart(3)}%    ${result.medianLatencyMs === null ? "—" : `${result.medianLatencyMs} ms`}`);
  }
  console.log("\nTop-1の正解率を満たしたうえで、p50レイテンシが最も短い設定を採用候補にします。");
}

async function main() {
  const threads = buildBenchmarkThreads();
  const report = [];
  for (const config of CONFIGS) report.push(await runConfig(config, threads));
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { CASES, CONFIGS, buildBenchmarkThreads, median, runConfig };
