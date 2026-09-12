function getConfiguredTarget(env = process.env) {
  const thread = typeof env.CODEX_TARGET_THREAD === "string" ? env.CODEX_TARGET_THREAD.trim() : "";
  const name = typeof env.CODEX_TARGET_NAME === "string" ? env.CODEX_TARGET_NAME.trim() : "";
  return thread ? { thread, name } : null;
}

function describeTarget(target) {
  if (!target?.thread) return "";
  return target.name ? `${target.name}（${target.thread}）` : target.thread;
}

module.exports = { describeTarget, getConfiguredTarget };
