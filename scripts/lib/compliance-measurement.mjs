/**
 * compliance-measurement.mjs — one definition of "measured" for the compliance plane.
 *
 * S337 root-fix. The compliance ledger recorded an UNMEASURABLE host as 0% compliance.
 *
 * What happened: the out-of-session lane (2026-09-11, commit 6cc45747) ran the
 * fleet-wide compliance validator on a host with none of the 36 sibling checkouts.
 * Every repo's `localPath` failed `existsSync`, each was recorded `failed`, and the
 * snapshot went in as `passed: 0 · failed: 36 · score: 0`. A live re-run on a host
 * that can see the fleet says `34/36 (94%)` — the same day, the same subject.
 *
 * The cost was not the wrong row; it was that two probes then told opposite stories
 * about one subject in the same doctor run:
 *   compliance-velocity (re-measures live)  → 34/36 (94%) ✓
 *   compliance-drift    (reads the ledger)  → latest 0% · slope -2.69 · proj 14d: 32% ⛔
 * The ledger-reader was forecasting a studio-wide compliance collapse from a
 * measurement that never happened, and the founder's startup brief led with
 * `⛔ Compliance 0/36 (0%)`.
 *
 * The defect is a missing third state, the class recorded in S318/S319/S328: a
 * measurement plane with only pass and fail maps "could not measure" onto the worse
 * neighbour. Two separate collapses produced the zero, and either alone is enough:
 *
 *   1. ABSENCE SCORED AS FAILURE. A repo that is not on this host is unmeasurable,
 *      not non-compliant. We cannot read files that are not here, so we know nothing
 *      about that repo's compliance — which is not the same as knowing it is broken.
 *   2. NOTHING MEASURED SCORED AS ZERO PERCENT. `score = total > 0 ? passed/total : 0`
 *      counted skipped rows in the denominator, so even the validator's own honest
 *      `skipped` path (`--ci`) yields `0/36 = 0%` — an empty aim reporting in the
 *      same voice as total failure (S317's `refused: 0` tell).
 *
 * So: `score` is a ratio over what was actually MEASURED, and when nothing was
 * measured it is `null` — never 0. `null` here means "not measured", and every
 * reader must skip such a snapshot rather than coerce it. Four coercions existed at
 * the time of the fix and each one alone re-created the false zero:
 * `trend()` and `renderMarkdown()` here, and `scores`/forecast in
 * check-compliance-drift.mjs.
 */

/**
 * Score a compliance run over its MEASURED denominator.
 *
 * @param {{passed?: number, failed?: number, skipped?: number}} counts
 * @returns {{passed: number, failed: number, unmeasurable: number, measuredTotal: number,
 *            total: number, score: number|null, measured: boolean}}
 */
export function scoreCompliance({ passed = 0, failed = 0, skipped = 0 } = {}) {
  const p = Math.max(0, Number(passed) || 0);
  const f = Math.max(0, Number(failed) || 0);
  const u = Math.max(0, Number(skipped) || 0);
  const measuredTotal = p + f;
  return {
    passed: p,
    failed: f,
    unmeasurable: u,
    measuredTotal,
    total: measuredTotal + u,
    // null, never 0: nothing was measured, so there is no pass rate to report.
    score: measuredTotal > 0 ? Math.round((p / measuredTotal) * 100) : null,
    measured: measuredTotal > 0,
    // What fraction of the intended fleet the score actually speaks for. A score is
    // a ratio over the MEASURED rows, so a run that reached 2 of 36 repos and found
    // both clean scores 100 — truthfully, about those two. Coverage is what stops
    // that 100 from being read as a clean fleet (S301: a checker's scope is part of
    // its guarantee; S304: a claim may not assert more than its adapter measures).
    coverage: measuredTotal + u > 0 ? Math.round((measuredTotal / (measuredTotal + u)) * 100) : null,
  };
}

/**
 * Is this a COMPLETE clean run — every intended repo measured, every one passing?
 *
 * The green verdict needs both halves. `score === 100` alone goes true the moment a
 * run reaches two repos and likes them, which is how a fleet-wide gate would come to
 * report perfection from a host that could see almost none of the fleet.
 */
export function isCompleteAndClean(counts) {
  const m = counts && typeof counts.measuredTotal === 'number' ? counts : scoreCompliance(counts);
  return m.measured && m.score === 100 && m.unmeasurable === 0;
}

/**
 * Is this snapshot a real measurement whose score a trend may consume?
 *
 * Tolerant of legacy rows written before `measured` existed: those carry a numeric
 * score and no unmeasurable accounting, so a numeric score is the evidence. A row
 * that explicitly says `measured: false`, or that has no numeric score, is not.
 *
 * Deliberately NOT a heuristic over suspicious-looking values — a legacy `score: 0`
 * stays consumable. Re-classifying old rows by how they look would be laundering; a
 * false row is corrected by RE-MEASURING it on a host that can see its subject
 * (the tracker upserts by date), not by guessing about it here.
 */
export function isMeasured(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (snapshot.measured === false) return false;
  return typeof snapshot.score === 'number' && Number.isFinite(snapshot.score);
}

/**
 * Split a snapshot series into the rows a trend may consume and the rows it may not.
 * Readers report `unmeasured.length` rather than silently narrowing their own window —
 * a window that quietly shrinks is the S301 scope defect (a checker's scope is part
 * of its guarantee).
 */
export function partitionMeasured(snapshots = []) {
  const rows = Array.isArray(snapshots) ? snapshots : [];
  return {
    measured: rows.filter(isMeasured),
    unmeasured: rows.filter(s => !isMeasured(s)),
  };
}

/**
 * May `next` replace `existing` as the row for its date?
 *
 * No, when `existing` is a real measurement and `next` is not. Both lanes upsert by
 * date, so without this an out-of-session host with no checkouts would overwrite the
 * day's real 34/36 with an unmeasurable row every time it ran — a measurement
 * losing to the absence of one. An unmeasurable row may still SEED an empty date
 * (that is honest: nobody measured that day), and a measurement always wins.
 */
export function mayReplaceSnapshot(existing, next) {
  if (!existing) return true;
  if (isMeasured(next)) return true;
  return !isMeasured(existing);
}

/**
 * How should an absent checkout be classified?
 *
 * A repo whose `localPath` does not resolve on this host is UNMEASURABLE — we cannot
 * read files that are not here. Two deliberate exceptions keep this from weakening a
 * real gate:
 *   - `strictMode` (`--strict`) is the opt-in "the whole fleet should be present
 *     here" mode, where an absent checkout IS the finding.
 *   - a SELF-owned absence stays a failure: studio-ops' own path must resolve on the
 *     host running studio-ops' own validator.
 *
 * @returns {'unmeasurable'|'failed'}
 */
export function classifyAbsentCheckout({ owner, strictMode = false } = {}) {
  if (strictMode) return 'failed';
  if (owner === 'self') return 'failed';
  return 'unmeasurable';
}

