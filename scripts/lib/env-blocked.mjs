/**
 * env-blocked.mjs — S336 [audit #2]. ONE shape, and a CAUSE, for a file that
 * produced no verdict.
 *
 * `env-blocked` is the honest CANON-031 class for a test file that is neither
 * green nor red. It was introduced (S203) for one cause — the host could not
 * spawn a child after backoff — and later reused (S280) for a structurally
 * different one: a file declaring `@integration-live-state <path>` whose path is
 * absent, which is decided BEFORE any spawn and is entirely independent of host
 * load. Both live in `run-tests.mjs` and `refresh-test-count.mjs`, at the same two
 * code sites in each.
 *
 * Collapsing them cost three separate defects, all live when this file was written:
 *
 *  1. The doctor renders ONE sentence for both: "host could not spawn; re-run on a
 *     quieter host." For `precondition-absent` that sentence is false — nothing was
 *     spawned, and a quieter host changes nothing. The declared fix for the `tests`
 *     probe therefore read `ATTEMPTED · outcome mixed` for seven consecutive
 *     sessions: the remedy attached to the red could not address the actual cause.
 *     (The missing-third-state shape — a classifier with N-1 states maps the
 *     missing one onto a worse neighbour, and here the neighbour carries advice
 *     that cannot work.)
 *  2. The two paired writers disagreed on the SHAPE. `run-tests.mjs` wrote an array
 *     of file names; `refresh-test-count.mjs` wrote a bare integer. The doctor's
 *     `countSignal()` tolerates both, so the divergence never surfaced — while the
 *     comment above it asserted both wrote arrays. Whenever the counter was the
 *     last writer, the identity of the blocked file was destroyed and the doctor
 *     asked the reader to re-run something it could no longer name.
 *  3. `refresh-test-count.mjs` fed its whole `inconclusiveFiles` list to
 *     `accountForSuite({ envBlocked })`, but that list also collects timeouts and
 *     files that PASSED on isolated retry. Live: 1 env-blocked, 2 inconclusive —
 *     so a file counted `passed++` was simultaneously accounted env-blocked.
 *
 * The repair is one entry shape, written identically by both surfaces, carrying the
 * cause — so the advice is derived from the cause instead of assumed.
 */

/**
 * A declared live-state path is absent, so the file has no verdict to give.
 * Decided without spawning. Host load is irrelevant; re-running changes nothing.
 */
export const PRECONDITION_ABSENT = 'precondition-absent';

/** The host could not spawn the child after the backoff budget. Transient. */
export const HOST_SPAWN_EXHAUSTED = 'host-spawn-exhausted';

/** A cause we cannot name — never silently folded into either of the above. */
export const CAUSE_UNKNOWN = 'unknown';

export const ENV_BLOCKED_CAUSES = [PRECONDITION_ABSENT, HOST_SPAWN_EXHAUSTED, CAUSE_UNKNOWN];

/**
 * Build one env-blocked entry.
 * @param {string} file   bare file name or repo-relative path
 * @param {string} cause  one of ENV_BLOCKED_CAUSES
 * @param {string} [detail] human detail (the missing path, the retry count, …)
 */
export function envBlockedEntry(file, cause, detail = '') {
  return {
    file: String(file || ''),
    cause: ENV_BLOCKED_CAUSES.includes(cause) ? cause : CAUSE_UNKNOWN,
    detail: String(detail || ''),
  };
}

/**
 * Read any historical shape back as entries. Tolerates, in order:
 *   - the current shape: [{file, cause, detail}]
 *   - the S203 shape:    ['a.mjs', 'b.mjs']      → cause unknown, identity kept
 *   - the counter shape: 3                        → n placeholder entries, NO identity
 *
 * The integer form is the defect this module exists to end: it can only be read
 * back as "n files, and we cannot tell you which". That is represented honestly
 * (empty `file`) rather than fabricated.
 *
 * @returns {{file:string, cause:string, detail:string}[]}
 */
export function normalizeEnvBlocked(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => (
      v && typeof v === 'object'
        ? envBlockedEntry(v.file, v.cause, v.detail)
        : envBlockedEntry(v, CAUSE_UNKNOWN)
    ));
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return [];
  return Array.from({ length: Math.trunc(n) }, () => envBlockedEntry('', CAUSE_UNKNOWN, 'legacy count-only record — file identity was not persisted'));
}

/** How many files are env-blocked, from any shape. */
export function envBlockedCount(value) {
  return normalizeEnvBlocked(value).length;
}

/** Group entries by cause, preserving order of first appearance. */
export function byCause(entries) {
  const out = new Map();
  for (const e of normalizeEnvBlocked(entries)) {
    if (!out.has(e.cause)) out.set(e.cause, []);
    out.get(e.cause).push(e);
  }
  return out;
}

/**
 * The remediation sentence for ONE cause. This is the whole point of the module:
 * before it, every cause inherited the spawn-exhaustion advice.
 */
export function adviceFor(cause) {
  switch (cause) {
    case PRECONDITION_ABSENT:
      return 'declared live state is absent — provide it or run the file directly; a quieter host will NOT change this';
    case HOST_SPAWN_EXHAUSTED:
      return 'host could not spawn; re-run on a quieter host';
    default:
      return 'cause not recorded — re-run the counter to capture it';
  }
}

/**
 * The doctor-facing summary: names the files and gives per-cause advice.
 * Returns '' for an empty set so callers can append unconditionally.
 */
export function envBlockedNote(value) {
  const entries = normalizeEnvBlocked(value);
  if (!entries.length) return '';
  const parts = [];
  for (const [cause, list] of byCause(entries)) {
    const named = list.map((e) => e.file).filter(Boolean);
    const who = named.length ? named.join(', ') : `${list.length} unnamed file(s)`;
    parts.push(`${who} — ${adviceFor(cause)}`);
  }
  return ` · ⚠ ${entries.length} env-blocked (${parts.join(' · ')})`;
}
