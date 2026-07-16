// context-verdicts.mjs — single source of truth for the context-meter verdict
// vocabulary + their process exit codes.
//
// WHY THIS EXISTS (S198): the verdict set drifted. `context-meter.mjs` grew a 4th
// verdict (`WARN_COMPACT_SOON`, added for proactive-autosave) but its contract test
// (`tier1-context-meter-gate`) still hardcoded the original 3, so the suite went red
// whenever the meter emitted the new verdict. Worse, the meter intentionally exits
// non-zero (2/3) to let hooks/skills route on the verdict — and the test used
// `execSync`, which THROWS on any non-zero exit, so the test silently failed 3/4
// assertions whenever measured context was high enough to recommend CLOSEOUT.
//
// Both producer (context-meter.mjs) and contract test now import from here, so the
// vocabulary and exit codes can never drift apart again (coherent-by-construction).
//
// Exit-code contract (consumed by ~/.claude hooks + closeout skills):
//   CONTINUE          → 0   keep working
//   WARN_COMPACT_SOON → 0   soft warn; compaction predicted soon, autosave but continue
//   CONSIDER_CLOSEOUT → 2   wrap up soon
//   CLOSEOUT          → 3   stop now; continuation risks truncation
//
// A non-zero exit is a ROUTING SIGNAL, not a failure — callers that only want the
// JSON must read stdout regardless of exit status (spawnSync, not execSync).

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

export function isValidVerdict(v) {
  return VERDICTS.includes(v);
}

export function exitForVerdict(v) {
  return VERDICT_EXITS[v] ?? 0;
}
