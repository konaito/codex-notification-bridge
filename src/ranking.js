(function exposeRanking(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CodexRanking = factory();
})(typeof globalThis === "object" ? globalThis : this, () => {
  const GENERIC_TOKEN_PARTS = ["確認", "して", "する", "でき", "たい", "こと", "方法", "対応", "お願い", "ください", "ほしい", "欲しい", "これ", "それ", "ため", "よう", "必要", "状態", "内容", "を確", "認し"];

  function normalize(value) {
    return String(value || "").toLocaleLowerCase("ja-JP").replace(/\s+/g, " ").trim();
  }

  function tokenize(value) {
    const chunks = normalize(value).match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+|[a-z0-9_-]+/gu) || [];
    const tokens = new Set();
    const addToken = token => {
      if (!GENERIC_TOKEN_PARTS.some(part => token.includes(part))) tokens.add(token);
    };

    for (const chunk of chunks) {
      if (chunk.length >= 1) addToken(chunk);
      if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+$/u.test(chunk)) {
        for (let index = 0; index < chunk.length - 1; index += 1) addToken(chunk.slice(index, index + 2));
      }
    }
    return [...tokens];
  }

  function scoreMatch(thread, message) {
    const query = normalize(message);
    const tokens = tokenize(query);
    if (!query || !tokens.length) return 0;

    const name = normalize(thread.name);
    const project = normalize(thread.project);
    const preview = normalize(thread.preview);
    let score = 0;
    if (query.length >= 2 && name.includes(query)) score += 80;
    if (query.length >= 2 && project.includes(query)) score += 60;

    for (const token of tokens) {
      const isLatin = /[a-z0-9_-]/u.test(token);
      if (name.includes(token)) score += isLatin ? 20 : 14;
      if (project.includes(token)) score += isLatin ? 11 : 9;
      if (preview.includes(token)) score += isLatin ? 7 : 4;
    }
    return score;
  }

  function rankThreads(threads, message, limit = 6) {
    const normalized = threads.filter(thread => thread?.sendable && thread.id);
    const query = normalize(message);
    const newestUpdatedAt = normalized.reduce((max, thread) => Math.max(max, Number(thread.updatedAt) || 0), 0);

    return normalized
      .map((thread, index) => {
        const matchScore = scoreMatch(thread, query);
        const freshness = newestUpdatedAt > 0 ? Math.max(0, 2 - (newestUpdatedAt - (Number(thread.updatedAt) || 0)) / 86_400) : 0;
        const activity = thread.status === "active" ? 4 : thread.status === "idle" ? 2 : 0;
        return { ...thread, matchScore, score: matchScore + activity + freshness, _index: index };
      })
      .filter(thread => !query || thread.matchScore > 0)
      .sort((left, right) => right.score - left.score || right.updatedAt - left.updatedAt || left._index - right._index)
      .slice(0, limit)
      .map(({ _index, ...thread }) => thread);
  }

  return { normalize, rankThreads, scoreMatch, tokenize };
});
