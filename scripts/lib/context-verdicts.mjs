// context-verdicts.mjs — single source of truth for context-meter routing and
// usage arithmetic shared by producers, renderers, hooks, and tests.
//
// Exit-code contract (consumed by hooks + closeout skills):
//   CONTINUE          → 0   keep working
//   WARN_COMPACT_SOON → 0   soft warn; compaction predicted soon
//   CONSIDER_CLOSEOUT → 2   wrap up soon
//   CLOSEOUT          → 3   stop now

export const VERDICTS = Object.freeze([
  "CONTINUE",
  "WARN_COMPACT_SOON",
  "CONSIDER_CLOSEOUT",
  "CLOSEOUT",
]);

export const VERDICT_EXITS = Object.freeze({
  CONTINUE: 0,
  WARN_COMPACT_SOON: 0,
  CONSIDER_CLOSEOUT: 2,
  CLOSEOUT: 3,
});

export function isValidVerdict(value) {
  return VERDICTS.includes(value);
}

export function exitForVerdict(value) {
  return VERDICT_EXITS[value] ?? 0;
}

/**
 * Derive usage from the two unambiguous source values.
 *
 * `pctUsed` has existed in both 0..1 and 0..100 shapes across propagated
 * context-meter versions. Consumers must never guess which shape they received;
 * token count and model limit are the canonical inputs.
 */
export function deriveContextUsage({ usedTokens = 0, limit = 0 } = {}) {
  const safeUsed = Number.isFinite(Number(usedTokens))
    ? Math.max(0, Number(usedTokens))
    : 0;
  const safeLimit = Number.isFinite(Number(limit))
    ? Math.max(0, Number(limit))
    : 0;
  const rawFraction = safeLimit > 0 ? safeUsed / safeLimit : 0;
  const fraction = Math.max(0, Math.min(1, rawFraction));
  const percent = fraction * 100;

  return Object.freeze({
    usedTokens: safeUsed,
    limit: safeLimit,
    remainingTokens: Math.max(0, safeLimit - safeUsed),
    fraction,
    percent,
    roundedPercent: Math.round(percent),
  });
}
