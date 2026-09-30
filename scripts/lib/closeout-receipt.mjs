// closeout-receipt.mjs — S283 [audit #1]. Proof that the closeout safety net RAN.
//
// THE DEFECT THIS EXISTS TO KILL
//
// S280 ruled `closeout-autopilot.mjs` "the commit/push safety net" and one of 13
// mandatory §3 closeout gates. It carries the scan-secrets abort, the context-wipe
// guard, the session-field heal-and-block (Step 3p2, which exits 3 rather than let
// a stale field ship), render-state-vector, compute-entropy, append-genome-snapshot
// and ignis-rescore-touched.
//
// It did not run at S281. It did not run at S282. Nothing noticed.
//
// It is skippable by simply not typing the command: an agent can `git add`,
// `git commit` and `git push` by hand and the session LOOKS closed, because the
// founder-facing artifacts (closeout brief, status board) come from separate
// renderers that were invoked directly. The only trace was a symptom nobody
// connected — `lastSession` frozen at 280 for three sessions while
// `currentSession` climbed to 282, which is precisely the invariant Step 3p2
// exists to make un-shippable.
//
// The lesson generalises past this script: a gate is only as strong as the
// evidence that it executed. Thirteen ruled gates had, between them, no artifact
// proving any of them ever ran. `.cache/*autopilot*` holds only ad-hoc shell
// redirects a human once typed.
//
// THE CONTRACT
//
// One NDJSON line per autopilot invocation, appended at process exit — so an
// ABORT is recorded as faithfully as a clean finish, and a run that dies inside
// Step 3p2 is distinguishable from a run that never happened. The receipt is
// deliberately dumb: it records what was attempted, what completed, and how the
// process ended. It makes no claim about correctness — only about execution.
//
//   { projectSlug, session, startedAt, finishedAt, exitCode, outcome, dry,
//     force, skipPush, gitSha, steps: [...], durationMs }
//
// `outcome`:
//   'completed' — reached the end of the script
//   'aborted'   — exited non-zero (a gate refused; this is the net WORKING)
//   'dry'       — a --dry-run preview; NOT evidence the gates ran
//
// A dry run is recorded and must never be counted as a real closeout, which is
// why `dry` is a first-class field rather than an inference from the message.
//
// ORDERING (measured S283, then fixed S283-followup). The receipt used to be
// written ONLY on process exit. That is what makes an abort recordable — but it
// landed AFTER the autopilot's own `git add`/commit step, so a run could never
// commit its own receipt and the ledger sat permanently one session behind in
// git. Evidence that is not committed is not durable, and durability is this
// file's entire purpose.
//
// Fixed by writing the row TWICE:
//   1. `open()` appends an `outcome: 'running'` row immediately, before any
//      commit step, so the run's own commit sweeps it up.
//   2. exit REWRITES that row in place with the real outcome.
//
// The intermediate state is deliberately called `running` and is NEVER treated
// as evidence by evaluateAutopilotExecution — a half-written row must not be
// mistakable for a completed run. A `running` row that survives (the process was
// killed hard enough to skip the exit handler) is therefore itself a signal:
// the closeout started and did not finish.
//
// Rewrite-in-place is keyed on `receiptId`, not on file position, so a
// concurrent writer appending between the two writes cannot cause the wrong row
// to be amended.

import { strictNumber } from './strict-number.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const RECEIPT_REL = path.join('portfolio', 'CLOSEOUT_AUTOPILOT_RECEIPTS.ndjson');

/**
 * Open a receipt and arm the exit flush. Returns a handle with `step(name)` so
 * the caller records progress; the flush happens automatically on ANY exit path.
 *
 * Pure-ish by design: the clock and the writer are injectable so tests never
 * touch the real ledger or the real time.
 */
export function openCloseoutReceipt({
  repoRoot,
  projectSlug = null,
  session,
  // S317 [audit #1] — WHERE the session number came from, and whether this run is
  // happening inside the session it names. A receipt that carries only a number
  // cannot be audited after the fact: S317 observed a dry run stamped `session:316`
  // while context/.session-lock read 317, and that row silently changed the verdict
  // of the probe that judges closeout integrity. `sessionSource` makes the stamp's
  // provenance readable, and `outOfBand` marks a row that must never be read as
  // evidence about the session it names.
  sessionSource = null,
  outOfBand = false,
  dry = false,
  force = false,
  skipPush = false,
  gitSha = null,
  now = () => new Date().toISOString(),
  arm = true,
  write = defaultAppend,
  upsert = defaultUpsert,
  receiptId = null,
} = {}) {
  const startedAt = now();
  const startMs = Date.parse(startedAt);
  const steps = [];
  const diagnostics = [];
  let flushed = false;
  // Identity for the rewrite. Deterministic from the start stamp + session so a
  // test can pin it, and unique enough in practice that two closeouts of the
  // same session started in the same millisecond would be needed to collide.
  const id = receiptId || `${session ?? 'x'}-${startedAt}`;

  const build = (exitCode, outcome) => {
    const finishedAt = outcome === 'running' ? null : now();
    return {
      receiptId: id,
      projectSlug: projectSlug || null,
      // S330 [audit #2] — AN OUT-OF-BAND ROW MUST NOT CLAIM A SESSION IT CANNOT PROVE.
      //
      // Without a lock the number comes from `max(closed) + 1`. That arithmetic is
      // right for ALLOCATING the next session and wrong for STAMPING this run: it
      // points FORWARD, at a session that has not started. Measured live — two rows
      // written 2026-09-07T18:52, during S329, stamped `session: 330`. They landed in
      // the ledger before S330 existed, and they were `aborted`. Every "which session
      // is this ledger talking about" resolver then read 330, found only aborted rows,
      // and `closeout-provenance` announced that S329's closeout "may not have run" —
      // while S329's own lock-backed receipt sat two lines above, `completed`, exit 0.
      //
      // A forward guess is strictly worse than declining to answer, because it
      // pre-poisons a session before that session can defend itself. So the claim is
      // withheld and the guess is preserved beside it, clearly named as a guess.
      // Readers get `null` — a value they already know how to treat as "unattributed"
      // — instead of a confident wrong number. (S316: a measurement crossing a session
      // boundary must prove which session it belongs to.)
      session: outOfBand ? null : (session ?? null),
      derivedSession: outOfBand ? (session ?? null) : null,
      sessionSource: sessionSource || null,
      outOfBand: Boolean(outOfBand),
      startedAt,
      finishedAt,
      durationMs: finishedAt && Number.isFinite(startMs) ? Math.max(0, Date.parse(finishedAt) - startMs) : null,
      exitCode: outcome === 'running' ? null : (exitCode ?? 0),
      outcome,
      dry: Boolean(dry),
      force: Boolean(force),
      skipPush: Boolean(skipPush),
      gitSha: gitSha || null,
      steps: [...steps],
      ...(diagnostics.length ? { diagnostics: structuredClone(diagnostics) } : {}),
    };
  };

  // Land a row NOW so the autopilot's own commit sweeps it up (see ORDERING).
  const open = () => {
    try { write(repoRoot, build(null, 'running')); } catch { /* never break a closeout */ }
  };

  const flush = (exitCode) => {
    if (flushed) return null;              // exit can fire more than once
    flushed = true;
    const record = build(exitCode, dry ? 'dry' : (exitCode ? 'aborted' : 'completed'));
    try { upsert(repoRoot, record); } catch { /* a receipt must never break a closeout */ }
    return record;
  };

  if (arm) { open(); process.on('exit', (code) => { flush(code); }); }

  return {
    receiptId: id,
    step: (name) => { if (name && !steps.includes(name)) steps.push(name); },
    steps: () => [...steps],
    diagnostic: (entry) => { if (entry && typeof entry === 'object') diagnostics.push(structuredClone(entry)); },
    build: (exitCode) => build(exitCode, dry ? 'dry' : (exitCode ? 'aborted' : 'completed')),
    open,
    flush,
  };
}

function defaultAppend(repoRoot, record) {
  const p = path.join(repoRoot, RECEIPT_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(record) + '\n');
}

/**
 * Replace the row carrying this receiptId, or append if absent. Keyed on the id
 * rather than on position, so a concurrent appender between open() and flush()
 * cannot cause the wrong row to be rewritten.
 */
function defaultUpsert(repoRoot, record) {
  const p = path.join(repoRoot, RECEIPT_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  let rows = [];
  try {
    rows = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return { __raw: l }; } });
  } catch { /* first write */ }
  // S284 [audit #2] — fail closed on an id-less record. The ledger's first row
  // predates receiptId and carries none; an incoming record without one would make
  // this `undefined === undefined` and OVERWRITE that historical receipt instead of
  // appending. A receipt ledger silently losing a receipt is the one thing it must
  // never do. open() always sets an id, so this guards the invariant, not a live bug.
  if (!record || !record.receiptId) {
    throw new Error('closeout receipt has no receiptId — refusing to write (it would overwrite the id-less legacy row)');
  }
  const i = rows.findIndex(r => r && r.receiptId && r.receiptId === record.receiptId);
  if (i >= 0) rows[i] = record; else rows.push(record);
  const out = rows.map(r => (r && r.__raw !== undefined ? r.__raw : JSON.stringify(r))).join('\n') + '\n';
  fs.writeFileSync(p, out);
}

/**
 * S351 [audit #1] — WHICH SESSION IS THIS ROW ABOUT, AND HOW SURE ARE WE?
 *
 * The writer above deliberately encodes "I cannot attribute this run" as
 * `session: null`, preserving the forward guess beside it as `derivedSession`
 * (S330). Its comment states the assumption it rests on: *"Readers get `null` —
 * a value they already know how to treat as unattributed."*
 *
 * They did not. Every reader in the repo wrote `Number(r.session)` and filtered
 * with `Number.isFinite`, and **`Number(null) === 0`, which is finite.** A
 * deliberate unknown therefore entered the arithmetic as the session number
 * ZERO — the worst possible value, because the only place it was consumed was a
 * `Math.min` computing the epoch *before which nothing can be judged*. Five null
 * rows dragged that epoch to 0 and turned 273 sessions that pre-date the
 * autopilot into proven bypasses, in a probe whose own header forbids exactly
 * that ("a gate nobody can clear is a gate that gets disabled").
 *
 * The same rows carried real session numbers in `derivedSession` that no reader
 * has ever read, so they simultaneously withheld their proof and poisoned the
 * floor.
 *
 * So the resolution lives HERE, in the module every consumer already imports,
 * rather than in whichever reader remembers. It returns the number AND its
 * provenance, so a caller that must distinguish an attributed row from a derived
 * one still can — what it can no longer do is silently read `0`.
 *
 *   attributed → `session` was recorded under a session lock; trust it.
 *   derived    → out-of-band; the number is a reconstruction, not a claim.
 *   null       → neither field is attributable. The honest unknown.
 *
 * `strictSession` rejects null/undefined/''/NaN instead of coercing them. That
 * one predicate is the whole defect.
 *
 * S351 [self-audit] — the predicate itself now lives in `lib/strict-number.mjs`.
 * This session wrote three private copies of it (here, `boot-amortization.mjs`
 * and `render-studio-brain.mjs`) while its own audit argued that a guarantee
 * attached to a caller is not attached to the fact. `strictSession` is kept as
 * the receipt-domain name for it, delegating rather than reimplementing.
 */
export function strictSession(value) {
  return strictNumber(value);
}

export function receiptSession(row) {
  const attributed = strictSession(row?.session);
  if (attributed !== null) return { session: attributed, provenance: 'attributed' };
  const derived = strictSession(row?.derivedSession);
  if (derived !== null) return { session: derived, provenance: 'derived' };
  return { session: null, provenance: 'unattributable' };
}

/** Convenience: the resolved number alone, or null. Never 0-by-coercion. */
export function receiptSessionNumber(row) {
  return receiptSession(row).session;
}

/** Parse the ledger; unreadable/absent → []. Malformed lines are skipped, not fatal. */
export function readCloseoutReceipts(repoRoot) {
  try {
    return fs.readFileSync(path.join(repoRoot, RECEIPT_REL), 'utf8')
      .split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

/**
 * Did session N's autopilot actually run?
 *
 * A DRY receipt is explicitly not evidence — it is a preview that skips every
 * write the gates exist to guard. `sessions` is the set of sessions with a real
 * (non-dry) receipt, so a caller can name exactly which closeouts are unproven
 * rather than only the newest.
 */
export function evaluateAutopilotExecution({ receipts = [], expectedSession = null } = {}) {
  // 'running' is an OPEN row, not an outcome: the closeout started and has not
  // reported how it ended. Counting it as evidence would let a killed run look
  // identical to a completed one — the exact conflation this file exists to
  // prevent, one level in.
  const real = receipts.filter(r => r && !r.dry && r.outcome !== 'running');
  // S351 [audit #1] — resolve through the shared chokepoint. Previously
  // `Number(r.session)` read every deliberate null as session 0, so an
  // out-of-band closeout could neither prove its own session nor be recognised
  // as unattributable.
  const want = strictSession(expectedSession);
  const sessions = new Set(real.map(receiptSessionNumber).filter((n) => n !== null));
  const forSession = want === null ? [] : real.filter(r => receiptSessionNumber(r) === want);
  const dryOnly = want !== null && !forSession.length
    && receipts.some(r => r?.dry && receiptSessionNumber(r) === want);

  if (expectedSession == null) {
    return { ok: false, ran: false, sessions: [...sessions], reason: 'no expected session to check against' };
  }
  if (forSession.length) {
    const last = forSession[forSession.length - 1];
    return {
      ok: true, ran: true, sessions: [...sessions], receipt: last,
      reason: `closeout-autopilot ran for S${expectedSession} (${last.outcome}, exit ${last.exitCode})`,
    };
  }
  return {
    ok: false, ran: false, sessions: [...sessions], dryOnly,
    reason: dryOnly
      ? `S${expectedSession} has only a --dry-run receipt — a preview skips every gate it previews`
      : `no closeout-autopilot receipt for S${expectedSession} — the closeout ran without its safety net, or the receipt was never written`,
  };
}

export default {
  openCloseoutReceipt, readCloseoutReceipts, evaluateAutopilotExecution, RECEIPT_REL,
  strictSession, receiptSession, receiptSessionNumber,
};
