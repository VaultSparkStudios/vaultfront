// doctor-score-coherence.mjs — guard the cached doctorScore the startup brief
// surfaces against cross-session staleness (S173 [audit #2]).
//
// Background: the SIGNALS box in the startup brief reads `status.doctorScore`
// from PROJECT_STATUS.json. Historically the brief's doctor preflight ran
// `doctor --fix` WITHOUT `--update-json`, so the displayed score was whatever
// the PRIOR session's closeout persisted. When a probe self-healed between
// sessions (propagation-adoption fail→warn) the brief kept surfacing a phantom
// ⛔ "N failing" the live doctor no longer agreed with — a CANON-031 lie on the
// studio's most-read surface.
//
// This lib is deliberately a pure, testable pair of predicates rather than a
// live doctor probe: a probe reading the very score the doctor writes is one
// run behind by construction (the score is persisted AFTER runChecks()), which
// would reintroduce the self-referential staleness-phantom class S167–S170
// worked to eliminate. The guard therefore lives in a deterministic tier test
// that asserts (a) the renderer's preflight still refreshes the score, and
// (b) the behavioral invariant that a render leaves the score same-day fresh.

// S266 ([SIL:1][S259 #2]) — midnight-stable freshness. Day-identity comparison
// fabricated a stale-red at every UTC rollover (00:00 UTC = 8pm founder-local):
// a score persisted 23:59 read "stale by 1d" one minute later. Freshness is a
// bounded AGE, not a calendar identity — prefer the full-resolution `ranAt`
// (persisted since S174) and compare hours; day-identity survives only as the
// legacy fallback for scores predating `ranAt`.
import { classifyLiveState } from './live-state-lag.mjs';

export const SCORE_FRESH_MAX_AGE_HOURS = 24;

/**
 * Is the cached doctorScore fresh (bounded age ≤ 24h)?
 * @param {object} status  parsed PROJECT_STATUS.json
 * @param {string} today   YYYY-MM-DD (legacy fallback comparison)
 * @param {number} [nowMs] clock override for tests (defaults to Date.now())
 * @returns {{ ok: boolean, date: string|null, ageDays: number|null, ageHours: number|null, reason: string }}
 */
export function scoreFreshness(status, today, nowMs = Date.now()) {
  const ds = status?.doctorScore;
  if (!ds || !ds.date) {
    return { ok: false, date: null, ageDays: null, ageHours: null, reason: 'no doctorScore persisted' };
  }
  const ranAtMs = ds.ranAt ? new Date(ds.ranAt).getTime() : NaN;
  if (Number.isFinite(ranAtMs)) {
    const ageHours = (nowMs - ranAtMs) / 3600_000;
    const ok = ageHours <= SCORE_FRESH_MAX_AGE_HOURS;
    return {
      ok,
      date: ds.date,
      ageDays: Math.floor(Math.max(0, ageHours) / 24),
      ageHours: Math.round(ageHours * 10) / 10,
      reason: ok ? `fresh (${Math.round(ageHours)}h old, bounded ≤${SCORE_FRESH_MAX_AGE_HOURS}h)` : `stale by ${Math.round(ageHours)}h (ran ${ds.ranAt})`,
    };
  }
  const ageDays = daysBetween(ds.date, today);
  return {
    ok: ageDays <= 0,
    date: ds.date,
    ageDays,
    ageHours: null,
    reason: ageDays <= 0 ? 'fresh (same-day, legacy day-granular score)' : `stale by ${ageDays}d (persisted ${ds.date}, today ${today})`,
  };
}

/**
 * Is the persisted `doctorScore` the SHAPE every surface renders — the
 * `{ passing, total, … }` object `run-doctor.mjs --update-json` writes?
 *
 * S276: the live field was the bare number `124`. Every reader guarded only against
 * ABSENCE (`!doctorScore`), and a number is truthy, so the brief took the object path
 * and printed `Doctor undefined/undefined (undefined%)` on the studio's most-read
 * surface. A malformed value is UNMEASURED, and CANON-031 says unmeasured must say so
 * — never as a stale value, and never as a token that merely looks like a reading.
 * `render-closeout-board.mjs` had already grown its own inline both-shapes guard, which
 * is the tell that this belonged in one shared place.
 *
 * @param {*} value  raw `status.doctorScore`
 * @returns {{ ok: boolean, score: object|null, reason: string }}
 */
export function readableDoctorScore(value) {
  if (value == null) {
    return { ok: false, score: null, reason: 'no doctorScore persisted' };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      score: null,
      reason: `doctorScore is a bare ${Array.isArray(value) ? 'array' : typeof value} (${JSON.stringify(value)}), not the {passing,total,…} object the doctor writes`,
    };
  }
  const missing = ['passing', 'total'].filter((k) => !Number.isFinite(value[k]));
  if (missing.length) {
    return { ok: false, score: null, reason: `doctorScore is missing numeric ${missing.join(' + ')}` };
  }
  return { ok: true, score: value, reason: 'well-formed' };
}

/**
 * Does the startup-brief renderer's doctor preflight persist the freshly-computed
 * score? Guards the exact mechanism of S173 [audit #1] against a flag-drop
 * regression. Mechanism-agnostic on HOW (looks for an `ops.mjs doctor` preflight
 * spawn that carries `--update-json`), so a future refactor that keeps refreshing
 * the score by another means must also keep this true.
 * @param {string} rendererSrc  source text of render-startup-brief.mjs
 * @returns {boolean}
 */
export function preflightRefreshesScore(rendererSrc) {
  if (typeof rendererSrc !== 'string') return false;
  // Find a spawn argv array that invokes the doctor and carries --update-json.
  // Tolerant of arg order / whitespace; rejects a bare `doctor --fix` preflight.
  const spawnMatch = rendererSrc.match(/\[[^\]]*['"]doctor['"][^\]]*\]/g);
  if (!spawnMatch) return false;
  return spawnMatch.some(argv => /--update-json/.test(argv));
}

/**
 * Coherence between the persisted failing count and a freshly-computed one.
 * @param {object} status        parsed PROJECT_STATUS.json
 * @param {number} liveFailing   failing count from a current runChecks()
 * @returns {{ ok: boolean, cached: number|null, live: number, reason: string }}
 */
/**
 * failingCoherent(status, liveFailing, snapshot?)
 *
 * Three states, not two (S340 [audit #3]):
 *   coherent     — the persisted failing count equals the snapshot's.
 *   persist-lag  — they differ, but the snapshot is an AD-HOC run (persisted:false)
 *                  that is genuinely newer than the persisted stamp: the persister
 *                  has not run since the producer. Not a contradiction; closeout's
 *                  `--update-json` clears it. ok:true with the state named, so a
 *                  reader cannot mistake it for a match.
 *   incoherent   — they differ and the snapshot claims to be persisted (or is a
 *                  legacy snapshot with no `persisted` field, which stays STRICT so
 *                  the S173 lie shape — cached 1 vs live 0 after --update-json — is
 *                  still caught).
 * A snapshot that says persisted:false but is OLDER than the persisted stamp is
 * incoherent too: lag can only run forward.
 */
export function failingCoherent(status, liveFailing, snapshot = null) {
  const cached = status?.doctorScore?.failing ?? null;
  // S340 #2 — the three-state decision now lives in the shared live-state-lag
  // helper. Only an AD-HOC snapshot (persisted:false) may claim to be newer: a
  // persisted or legacy snapshot gets no producer timestamp, so a divergence can
  // never be lag and stays strict (the S173 shape). The helper's 'unknown' maps
  // to incoherent here, preserving this function's two-verdict ok contract.
  const adHoc = snapshot && snapshot.persisted === false;
  const v = classifyLiveState({
    producer: { name: 'snapshot', value: liveFailing, at: adHoc ? snapshot.generatedAt : undefined },
    persister: { name: 'persisted doctorScore', value: cached, at: status?.doctorScore?.ranAt },
    equal: (x, y) => x === y,
    remedy: 'node scripts/ops.mjs doctor --update-json',
    label: 'failing',
  });
  if (v.state === 'coherent') {
    return { ok: true, state: 'coherent', cached, live: liveFailing, reason: 'cached failing matches live' };
  }
  if (v.state === 'persist-lag') {
    return {
      ok: true,
      state: 'persist-lag',
      cached,
      live: liveFailing,
      reason: `cached ${cached} ≠ snapshot ${liveFailing} failing, but the snapshot (${snapshot.generatedAt}) is an ad-hoc run newer than the persisted stamp (${status.doctorScore.ranAt}) — persist lag, not a contradiction; run: ${v.remedy}`,
    };
  }
  return {
    ok: false,
    state: 'incoherent',
    cached,
    live: liveFailing,
    reason: `cached ${cached} ≠ live ${liveFailing} failing`,
  };
}

function daysBetween(a, b) {
  try { return Math.round((new Date(b) - new Date(a)) / 86400000); } catch { return null; }
}
