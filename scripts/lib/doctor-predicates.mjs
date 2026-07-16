// doctor-predicates.mjs — S172 [audit #4]. Single source of truth for the three
// status predicates over a doctor check object, killing the divergent inline
// definitions that had drifted across surfaces (the S153 divergent-observability
// hazard, at the meta level the whole honesty arc fights).
//
// Before this lib, "is this a warning?" was hand-rolled in at least two places
// with DIFFERENT denominators:
//   • render-startup-brief.mjs  →  !pass && warn && !skipped   (yellow only)
//   • classify-warning-provenance.mjs → pass===false || warn===true  (non-green:
//        yellow AND red) — its own comment admitted "a broader non-green set".
// Those two answer genuinely DIFFERENT questions (a warning tally vs a
// classify-everyone-non-green pass), so the fix is not to force them equal — it
// is to NAME both predicates canonically and make every surface pick the right
// one EXPLICITLY, so the choice is auditable and can never silently drift again.
//
// A doctor check is one of:
//   • skipped — not run (pass:null, skipped:true). Never green/yellow/red.
//   • green   — ran and clean (pass:true, !warn).
//   • warning — ran, soft advisory (warn:true, !pass). The yellow tally.
//   • failing — ran and hard-failed (pass:false, !warn).
// warn+pass:false together still reads as warning (the soft path dominates the
// founder signal); the doctor tally treats it that way (run-doctor.mjs).

export function isSkipped(c) {
  return c?.skipped === true;
}

// GREEN — ran and clean. (pass strictly true, not warning, not skipped.)
export function isGreen(c) {
  return !isSkipped(c) && c?.pass === true && c?.warn !== true;
}

// WARNING — the canonical yellow tally. Matches run-doctor.mjs's warning count
// and the brief's box tally: ran, not green, carries a warn flag. This is what
// "N warn" means on every founder-facing surface.
export function isWarning(c) {
  return !isSkipped(c) && c?.pass !== true && c?.warn === true;
}

// FAILING — ran, hard fail, no soft-warn flag. Reds the board / blocks closeout
// when blocking:true.
export function isFailing(c) {
  return !isSkipped(c) && c?.pass === false && c?.warn !== true;
}

// NON-GREEN — the union the provenance classifier walks: every check that is not
// skipped and not green (warnings AND failures). Strictly a superset of
// isWarning. Use this when you mean "everything that needs an owner", and
// isWarning when you mean "the yellow count the founder reads".
export function isNonGreen(c) {
  return !isSkipped(c) && (c?.pass === false || c?.warn === true);
}

export default { isSkipped, isGreen, isWarning, isFailing, isNonGreen };
