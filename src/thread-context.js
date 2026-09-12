const MAX_ITEM_LENGTH = 720;
const MAX_RECENT_ITEMS = 10;
const MAX_OUTPUT_LENGTH = 280;

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value, limit = MAX_ITEM_LENGTH) {
  const text = asText(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function textFromContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map(item => typeof item === "string" ? item : item?.text)
    .filter(value => typeof value === "string")
    .join("\n")
    .trim();
}

function compactThreadItem(item) {
  if (!item || typeof item !== "object") return null;
  const type = asText(item.type);
  if (type === "userMessage") {
    const text = truncate(textFromContent(item.content));
    return text ? { role: "user", type, text } : null;
  }
  if (type === "agentMessage") {
    const text = truncate(item.text);
    return text ? { role: "assistant", type, text } : null;
  }
  if (type === "plan") {
    const text = truncate(item.text);
    return text ? { role: "assistant", type, text } : null;
  }
  if (type === "commandExecution") {
    const text = truncate([item.command, truncate(item.aggregatedOutput, MAX_OUTPUT_LENGTH)].filter(Boolean).join("\n"));
    return text ? { role: "tool", type, text, status: asText(item.status) || "unknown" } : null;
  }
  if (type === "fileChange") {
    const paths = Array.isArray(item.changes)
      ? item.changes.map(change => [asText(change?.kind?.type || change?.kind), asText(change?.path)].filter(Boolean).join(" ")).filter(Boolean)
      : [];
    const text = truncate(paths.join("\n"));
    return text ? { role: "tool", type, text, status: asText(item.status) || "unknown" } : null;
  }
  if (type === "mcpToolCall" || type === "dynamicToolCall") {
    const name = [asText(item.server), asText(item.tool)].filter(Boolean).join("/") || type;
    return { role: "tool", type, text: name, status: asText(item.status) || "unknown" };
  }
  if (type === "collabAgentToolCall") {
    return { role: "tool", type, text: asText(item.tool) || type, status: asText(item.status) || "unknown" };
  }
  if (type === "subAgentActivity" || type === "webSearch" || type === "enteredReviewMode" || type === "exitedReviewMode") {
    const text = truncate(item.query || item.review || item.kind);
    return text ? { role: "tool", type, text } : null;
  }
  return null;
}

function turnTimestamp(turn, fallback) {
  const timestamp = Number(turn?.startedAt ?? turn?.completedAt);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function extractThreadContext(threadOrTurns) {
  const turns = Array.isArray(threadOrTurns)
    ? threadOrTurns
    : Array.isArray(threadOrTurns?.turns) ? threadOrTurns.turns : [];
  const orderedTurns = turns
    .map((turn, index) => ({ turn, index, timestamp: turnTimestamp(turn, index) }))
    .sort((left, right) => left.timestamp - right.timestamp || left.index - right.index)
    .map(entry => entry.turn);
  const recentTurns = orderedTurns.slice(-3);
  const allItems = recentTurns.flatMap(turn => Array.isArray(turn?.items) ? turn.items : [])
    .map(compactThreadItem)
    .filter(Boolean);
  const recentItems = allItems.slice(-MAX_RECENT_ITEMS);
  const lastUserMessage = [...allItems].reverse().find(item => item.role === "user")?.text || "";
  const lastAssistantMessage = [...allItems].reverse().find(item => item.role === "assistant" && item.type === "agentMessage")?.text || "";
  const latestTurn = recentTurns.at(-1);

  return {
    available: recentItems.length > 0,
    lastTurnStatus: asText(latestTurn?.status) || null,
    lastUserMessage,
    lastAssistantMessage,
    recentItems,
  };
}

module.exports = { compactThreadItem, extractThreadContext };
