// host-load.mjs — cheap host-saturation probe for freshness-honest signalling.
//
// WHY: when the test suite can't run because the host is saturated with concurrent
// sessions (many node.exe processes + handle exhaustion), `test-suite-freshness`
// would only see "age > 24h" and report the suite as "code-stale" — implying a
// code regression that doesn't exist. This probe lets the surface distinguish:
//   • env-blocked  → host saturation is the likely cause (many node procs)
//   • code-stale   → host looks idle; staleness more likely a real regression
//
// CANON-031: this surface must not lie. "env-blocked" is not a green-wash — the
// probe still returns pass:false; it just carries an honest cause qualifier.
//
// S197 [SIL #2] — freshness-host-limited honest state.
//
// ── S290 [audit #1] — THE CENSUS MUST NOT REPORT UNKNOWN AS IDLE ─────────────
//
// The census shells `tasklist` with a 5s timeout. Under the very saturation it
// exists to detect, that spawn is itself slowed — so the call times out and the
// old code returned `{ nodeCount: -1, saturated: false, error: true }`. Two
// consumers then read `saturated === false` and could not tell a MEASURED idle
// host from a host we FAILED TO MEASURE. Measured live at S290:
//
//   getHostLoad()   → elapsedMs 5045 → { nodeCount: -1, saturated: false }
//   formatHostTag() → ''            ← printed nothing at all
//
// on a host carrying 184 node processes at 100% CPU. `deriveDoctorConcurrency`
// took that as licence for its max-concurrency branch and emitted the sentence
// "host not saturated" — a claim about a measurement that never happened. The
// direction is what makes it worse than a normal fail-open: saturation causes
// the timeout that hides the saturation, and the hidden saturation raises the
// load. It is a positive feedback loop into the failure.
//
// So `saturated` is now THREE-state and `measured` says which world you are in:
//
//   { measured: true,  saturated: false }  → we looked; the host is idle
//   { measured: true,  saturated: true  }  → we looked; the host is saturated
//   { measured: false, saturated: null  }  → we could not look. NOT idle.
//
// `saturated: null` is deliberate rather than a fourth boolean: it breaks any
// `typeof x.saturated === 'boolean'` assumption loudly, at the consumer, instead
// of quietly flowing through a `!== true` comparison as if it were idle. The rule
// this restores is one the repo already wrote — see quiet-host-proof.mjs, which
// has always deferred on an unreadable census "rather than guessing". This is
// that same rule, applied at the sites that were guessing.

import { spawnSync } from './safe-spawn.mjs';

// Node processes ≥ this count → "host likely saturated with concurrent sessions".
// Each Claude Code session spawns ~1-3 node.exe instances; 6+ = 2+ concurrent sessions.
const HOST_SATURATION_THRESHOLD = 6;

/** Census budget. Exceeding it yields `measured:false`, never a `saturated:false`. */
const CENSUS_TIMEOUT_MS = 5000;

/** The one shape for "we did not manage to measure the host". */
function unmeasured(reason) {
  return { nodeCount: -1, saturated: null, measured: false, error: true, reason };
}

/**
 * Returns a snapshot of the current host node-process count.
 *
 * @returns {{ nodeCount: number, saturated: boolean|null, measured: boolean, error?: boolean, reason?: string }}
 *   `saturated` is null exactly when `measured` is false — an unread census, which
 *   callers MUST NOT treat as an idle host.
 */
export function getHostLoad() {
  try {
    const isWin = process.platform === 'win32';
    let r;
    if (isWin) {
      // `tasklist /FI "IMAGENAME eq node.exe" /NH /FO CSV` — /NH requires CSV or TABLE
      r = spawnSync(
        'tasklist',
        ['/FI', 'IMAGENAME eq node.exe', '/NH', '/FO', 'CSV'],
        { windowsHide: true, encoding: 'utf8', timeout: CENSUS_TIMEOUT_MS },
      );
      // A timeout surfaces as either r.error (ETIMEDOUT) or a null status with a
      // kill signal; both mean the census did not complete. Reporting a count of
      // zero here is what produced the S290 phantom-idle host.
      if (r.error) return unmeasured(`census failed: ${r.error.code || r.error.message}`);
      if (r.signal || r.status === null) return unmeasured(`census timed out after ${CENSUS_TIMEOUT_MS}ms`);
      // Each matching process produces one CSV row; no header (we used /NH).
      // When nothing matches, tasklist still exits 0 but prints "INFO: No tasks …"
      const nodeCount = r.stdout.split('\n').filter(l => l.startsWith('"node.exe"')).length;
      return { nodeCount, saturated: nodeCount >= HOST_SATURATION_THRESHOLD, measured: true };
    } else {
      // `ps -A -o comm=` lists all process command names, one per line
      r = spawnSync('ps', ['-A', '-o', 'comm='], { encoding: 'utf8', timeout: CENSUS_TIMEOUT_MS });
      if (r.error) return unmeasured(`census failed: ${r.error.code || r.error.message}`);
      if (r.signal || r.status === null) return unmeasured(`census timed out after ${CENSUS_TIMEOUT_MS}ms`);
      if (r.status !== 0) return unmeasured(`census exited ${r.status}`);
      const observedCount = r.stdout.split('\n').filter(l => l.trim() === 'node').length;
      // Linux runners may expose the current process under a wrapper/thread
      // name even though this code is executing inside Node. The census still
      // has one proven Node process: this process itself.
      const nodeCount = Math.max(1, observedCount);
      return { nodeCount, saturated: nodeCount >= HOST_SATURATION_THRESHOLD, measured: true };
    }
  } catch (err) {
    return unmeasured(`census threw: ${err?.code || err?.message || 'unknown'}`);
  }
}

/**
 * True only when the host was actually measured AND found idle. This is the
 * predicate every "is it safe to add load?" decision should use — `!saturated`
 * is not that predicate, because it is also true for a census that never ran.
 *
 * @param {{ saturated?: boolean|null, measured?: boolean }} load
 */
export function isMeasuredIdle(load) {
  return load?.measured === true && load?.saturated === false;
}

/** True when the census did not complete — neither idle nor saturated is known. */
export function isUnmeasured(load) {
  return !load || load.measured !== true;
}

/**
 * Returns a human-readable saturation tag for embedding in probe detail strings.
 * Empty string ONLY for a measured, idle host (avoids noisy normal-state output).
 *
 * S290 [audit #1]: an unread census previously also returned '', so a host we
 * could not measure printed exactly the same as a host we measured and found
 * quiet. Unknown now says so — an absent measurement is a finding, not silence.
 *
 * @param {{ nodeCount: number, saturated: boolean|null, measured?: boolean, reason?: string }} load
 * @returns {string}
 */
export function formatHostTag(load) {
  if (isUnmeasured(load)) {
    const why = load?.reason ? `: ${load.reason}` : '';
    return ` · host load UNMEASURED${why} — saturation neither confirmed nor ruled out`;
  }
  if (!load.saturated) return '';
  return ` · env-blocked (${load.nodeCount} node procs, host saturated — code-stale unconfirmed)`;
}
