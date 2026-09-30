// session-identity.mjs — one monotonic session identity for locks and traces.
//
// A lock describes the ACTIVE session. Durable status and SIL describe the
// newest CLOSED session. Keep those concepts separate: the handoff deliberately
// names the next session, so scanning every S<n> token would advance twice.
import fs from 'node:fs';
import path from 'node:path';

export function sessionIdFromLock(text) {
  const match = String(text || '').match(/^session[-_]?id:\s*([0-9]+)\s*$/mi);
  return match ? Number(match[1]) : null;
}

export function closedSessionFromStatus(status = {}) {
  const values = [status.currentSession, status.lastSession, status.silLastSession]
    .map(Number)
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

export function closedSessionFromSil(text) {
  const values = [];
  for (const match of String(text || '').matchAll(/^## .*?\bSession\s+([0-9]+)\b/gmi)) {
    values.push(Number(match[1]));
  }
  return values.length ? Math.max(...values) : null;
}

/**
 * S328 audit #2 — the newest session label already SPENT in git history.
 *
 * The closed-session surfaces below (PROJECT_STATUS, SIL) only learn a number exists
 * once that session closes out. A session that commits work and then ends without a
 * closeout is therefore invisible to them, and `max(closed) + 1` hands its number to
 * the NEXT session. Measured live: `20f71c25 incident(S327)` was committed
 * 2026-09-03 and never closed out, so both closed surfaces still read 326 and this
 * resolver issued 327 a second time — into the session lock and, from there, into
 * docs/STARTUP_BRIEF.md. Two sessions, one identity, permanently.
 *
 * Git history is the one surface that records a number the moment it is spent rather
 * than when it is closed, which is what makes the allocator monotonic in practice and
 * not merely in prose. (The arc protocol has always said "take max of every session
 * label already committed to git, plus one"; nothing enforced it.)
 *
 * Guards: `limit` bounds the scan; `maxLead` rejects an implausible jump so a stray
 * "S9999" in a commit subject cannot run the counter away. Any git failure returns
 * null and the caller degrades to its previous behaviour.
 */
export function committedSessionFromGit(root, { maxLead = 50, floor = null, run = null, text = null } = {}) {
  // No spawn in this module, by design. write-session-lock.mjs is deliberately COPIED
  // standalone (concurrency + bootstrap fixtures copy exactly four files), and this
  // module travels with it. An import of lib/safe-spawn.mjs would drag its own
  // transitive deps into every such copy; importing node:child_process directly is
  // barred by the §0 window-storm lint, and rightly so. So the git text is INJECTED:
  // the caller — which is not itself copied standalone — reads it and passes it in.
  // A copy that cannot read git simply gets `null` and degrades to the closed-surface
  // answer, which is the documented standalone behaviour.
  const out = typeof run === 'function' ? run() : text;
  if (typeof out !== 'string') return null;
  const values = [];
  for (const match of out.matchAll(/\bS([0-9]{2,4})\b/g)) values.push(Number(match[1]));
  if (!values.length) return null;
  const bound = Number.isFinite(floor) ? floor + maxLead : Infinity;
  const plausible = values.filter(v => Number.isFinite(v) && v <= bound);
  return plausible.length ? Math.max(...plausible) : null;
}

export function resolveActiveSessionId(root, { lockText = null, gitLogText = null } = {}) {
  const lockPath = path.join(root, 'context', '.session-lock');
  let activeText = lockText;
  if (activeText == null) {
    try { activeText = fs.readFileSync(lockPath, 'utf8'); } catch { activeText = ''; }
  }
  const active = sessionIdFromLock(activeText);
  if (Number.isFinite(active)) return active;

  let status = {};
  let sil = '';
  try {
    status = JSON.parse(fs.readFileSync(path.join(root, 'context', 'PROJECT_STATUS.json'), 'utf8'));
  } catch {}
  try {
    sil = fs.readFileSync(path.join(root, 'context', 'SELF_IMPROVEMENT_LOOP.md'), 'utf8');
  } catch {}
  const closed = [closedSessionFromStatus(status), closedSessionFromSil(sil)]
    .filter(Number.isFinite);
  if (!closed.length) return null;
  const closedMax = Math.max(...closed);
  // S328 audit #2 — a number already committed to git is SPENT, even if no closed
  // surface records it. Take the max over both, so the counter is monotonic over
  // everything used rather than only over everything finished. Skipped numbers are
  // cheap; a reused number corrupts the ledger permanently.
  const spent = committedSessionFromGit(root, { floor: closedMax, text: gitLogText });
  const highestUsed = Number.isFinite(spent) ? Math.max(closedMax, spent) : closedMax;
  return highestUsed + 1;
}

/**
 * S317 [audit #1] — resolve which session a RUN belongs to, and say where the
 * answer came from, so a stamp can be audited instead of trusted.
 *
 * This module already drew the line that matters ("a lock describes the ACTIVE
 * session; durable status and SIL describe the newest CLOSED session"), but the
 * closeout autopilot never called it. Its own resolver built a candidate set from
 * three CLOSED-session surfaces and took Math.max over them — and a max over
 * lagging indicators is still lagging, no matter how many are added. Measured on
 * 2026-09-02: a run under a lock reading session_id 317 stamped its receipt
 * session:316, and that row was then read as evidence about S316, flipping the
 * verdict of the probe that judges closeout integrity.
 *
 * The lock WINS outright rather than joining a max: joining would let a stale
 * higher number from a closed-session surface outrank the live one, and would hide
 * which surface actually answered.
 *
 * `source: 'derived'` means no lock was readable and the number came from
 * closed-session surfaces. Such a stamp cannot prove it names the session the run
 * happened in, so it is marked `outOfBand: true` rather than presented as equal to
 * a lock-backed one.
 *
 * @param {string} root      project root
 * @param {object} [opts]
 * @param {string|null} [opts.lockText] inject the lock body instead of reading it
 * @returns {{ session: number|null, source: 'lock'|'derived', outOfBand: boolean }}
 */
export function resolveRunSession(root, { lockText = null, explicit = null } = {}) {
  // S338 [S337 #4] — an operator-declared session outranks every inference. The lock
  // is gone by the time a closeout runs after a completed manual write-back, and that
  // write-back has already recorded the session as CLOSED — so `max(closed) + 1`
  // names the NEXT session (measured: an S337 closeout stamped derivedSession 338,
  // which no S337 gate could ever accept). A declaration is not a proof, so it keeps
  // its own provenance label rather than borrowing the lock's; it is in band because
  // it names the session being closed, not a guess about one.
  if (explicit != null && String(explicit).trim() !== '') {
    const n = Number(String(explicit).trim().replace(/^S/i, ''));
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`invalid explicit session "${explicit}" — expected a positive integer like 338 or S338`);
    }
    return { session: n, source: 'explicit', outOfBand: false };
  }
  let activeText = lockText;
  if (activeText == null) {
    try { activeText = fs.readFileSync(path.join(root, 'context', '.session-lock'), 'utf8'); }
    catch { activeText = ''; }
  }
  const fromLock = sessionIdFromLock(activeText);
  if (Number.isFinite(fromLock)) return { session: fromLock, source: 'lock', outOfBand: false };

  // No lock. resolveActiveSessionId's fallback is max(closed) + 1, which is the
  // right arithmetic: the active session is one PAST the newest closed one, not
  // the closed one itself. Passing '' keeps it from re-reading the lock we just
  // established is unreadable.
  const derived = resolveActiveSessionId(root, { lockText: '' });
  return { session: Number.isFinite(derived) ? derived : null, source: 'derived', outOfBand: true };
}

export default {
  sessionIdFromLock,
  closedSessionFromStatus,
  closedSessionFromSil,
  committedSessionFromGit,
  resolveActiveSessionId,
  resolveRunSession,
};
