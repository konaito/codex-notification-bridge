const DAY_SECONDS = 86_400;

const ORCHESTRATION_WEIGHTS = Object.freeze({
  semantic: 0.60,
  recency: 0.25,
  status: 0.15,
});

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function timestampOf(thread) {
  const timestamp = Number(thread?.lastInteractionAt ?? thread?.updatedAt);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function secondsSinceLastInteraction(threadOrTimestamp, nowSeconds = Date.now() / 1000) {
  const timestamp = typeof threadOrTimestamp === "object" ? timestampOf(threadOrTimestamp) : Number(threadOrTimestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return Math.max(0, Number(nowSeconds) - timestamp);
}

function recencyScore(threadOrTimestamp, nowSeconds = Date.now() / 1000) {
  const age = secondsSinceLastInteraction(threadOrTimestamp, nowSeconds);
  return age === null ? 0 : Math.exp(-age / DAY_SECONDS);
}

function statusScore(status) {
  if (status === "active") return 1;
  if (status === "idle") return 0.65;
  if (status === "notLoaded") return 0.35;
  return 0;
}

function orchestrationFeatures(thread, nowSeconds = Date.now() / 1000) {
  const seconds = secondsSinceLastInteraction(thread, nowSeconds);
  return {
    lastInteractionAt: timestampOf(thread) || null,
    secondsSinceLastInteraction: seconds,
    recencyScore: recencyScore(thread, nowSeconds),
    statusScore: statusScore(thread?.status),
  };
}

function orchestrationScore(thread, semanticScore = 0, nowSeconds = Date.now() / 1000) {
  const features = orchestrationFeatures(thread, nowSeconds);
  const normalizedSemanticScore = clamp(Number(semanticScore) || 0);
  return {
    ...features,
    semanticScore: normalizedSemanticScore,
    score: normalizedSemanticScore * ORCHESTRATION_WEIGHTS.semantic
      + features.recencyScore * ORCHESTRATION_WEIGHTS.recency
      + features.statusScore * ORCHESTRATION_WEIGHTS.status,
  };
}

function rankWithOrchestration(threads, semanticCandidates, limit = 5, nowSeconds = Date.now() / 1000) {
  const semanticById = new Map(
    (Array.isArray(semanticCandidates) ? semanticCandidates : [])
      .filter(candidate => candidate?.id)
      .map(candidate => [candidate.id, candidate]),
  );

  return (Array.isArray(threads) ? threads : [])
    .filter(thread => thread?.sendable !== false && thread?.id && semanticById.has(thread.id))
    .map(thread => {
      const semantic = semanticById.get(thread.id);
      const score = orchestrationScore(thread, semantic.semanticScore, nowSeconds);
      return { ...thread, ...score, reason: typeof semantic.reason === "string" ? semantic.reason : "" };
    })
    .sort((left, right) => right.score - left.score
      || right.semanticScore - left.semanticScore
      || right.recencyScore - left.recencyScore)
    .slice(0, limit);
}

module.exports = {
  ORCHESTRATION_WEIGHTS,
  orchestrationFeatures,
  orchestrationScore,
  rankWithOrchestration,
  recencyScore,
  secondsSinceLastInteraction,
  statusScore,
};
