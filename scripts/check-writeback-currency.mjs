#!/usr/bin/env node
// check-writeback-currency.mjs — did the last working session actually write back?
//
// THE GAP THIS CLOSES (S272, found live).
// Every pre-existing coherence probe compares surface against surface:
//   · closeout-session-coherence — status must not CLAIM more than the surfaces contain
//   · session-number-freshness   — PROJECT_STATUS must not LAG SIL/handoff
// Both are satisfied when every surface agrees at S<n>. Neither can see the
// opposite failure: the surfaces agree with each other and are all equally
// WRONG, because real work landed in git afterwards and closeout never ran.
//
// That is exactly what happened after S269: two working blocks (186 files,
// +38k lines — Studio Ops Console v1, CANON-054/055, CANON-053 bypass fixes,
// twin alwaysApprove, sanitize-by-content) were committed and pushed, but the
// closeout write-back never executed. Tree stayed clean, every surface still
// said S269, every coherence probe stayed green, and the drift was invisible.
//
// So this probe measures surfaces against GIT REALITY instead.
//
// ANCHOR CHOICE (deliberate): the newest commit touching
// context/SELF_IMPROVEMENT_LOOP.md. SIL is append-only and written exactly once
// per closeout, which makes it the only true closeout fingerprint. Do NOT anchor
// on PROJECT_STATUS.json — the live incident had a test-receipt-only commit
// (`chore(proof): S271 full-suite receipt`) touching PROJECT_STATUS without a
// closeout, which would have laundered the debt into a false green.
//
// Usage: node scripts/check-writeback-currency.mjs [--project <path>] [--json] [--explain|--repair-plan] [--fix]
// Exit: 0 = current (or in-flight) · 1 = write-back debt.

import fs from 'node:fs';
import path from 'node:path';
import { parseSessionLock } from './lib/agent-identity.mjs';
import { latestSilSession } from './lib/sil-ledger.mjs';
import { spawnSync } from './lib/safe-spawn.mjs';
import { GIT_UPSTREAM_REF_ARGS } from './lib/shared-policies.mjs';
import {
  findRoutineReceipt,
  readRoutineReceipts,
  ROUTINE_RECEIPT_LEDGER as ROUTINE_SESSION_RECEIPT_LEDGER,
} from './lib/routine-session-receipt.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const JSON_OUT = process.argv.includes('--json');
const EXPLAIN = process.argv.includes('--explain') || process.argv.includes('--repair-plan');
/** S320 [audit #5] — apply the remedy this probe has only ever named. */
const FIX = process.argv.includes('--fix');

/** The append-only closeout fingerprint. One commit per closeout, never generated. */
export const WRITE_BACK_ANCHOR = 'context/SELF_IMPROVEMENT_LOOP.md';

/**
 * Commits whose SUBJECT marks them as an out-of-session automation lane or a
 * pure receipt/regeneration commit. These land on main without a human session
 * and must never be mistaken for un-written-back work.
 */
// `chore(closeout)` is included deliberately: those commits ARE the closeout
// (receipt capture, rebased-surface regeneration) and legitimately land after
// the SIL anchor. Counting them as debt would make every clean closeout dirty.
export const AUTOMATION_SUBJECT_RE =
  /^(?:chore\((?:routine-[\w-]+|closeout|ledgers?|proof|deps|release-please)\)|Merge (?:branch|pull request|remote-tracking)|Revert ")/i;
export const ROUTINE_AUTOMATION_SUBJECT_RE = /^chore\(routine-[\w-]+\)/i;
export const ROUTINE_RECEIPT_ENFORCEMENT_AT = Date.parse('2026-08-23T06:00:00.000Z');

/**
 * Paths that are generated, appended by tooling, or pure receipts. A commit that
 * touches ONLY these is churn, not session work — regardless of its subject.
 */
export const GENERATED_PATH_RES = [
  /^portfolio\/.*\.ndjson$/i,
  /^portfolio\/ark\/log\//i,
  /^reports?\//i,
  /^docs\/AUDIT_\d{4}-\d{2}-\d{2}-routine\./i,
  /^docs\/STARTUP_BRIEF/i,
  /^docs\/FRONTIER_CAPABILITY_RADAR\.md$/i,
  /^docs\/CLOSEOUT_CHECKLIST\.md$/i,
  // S291 — the closeout's own rendered artifacts. Caught by this session's new
  // corrections state firing on this session's own closeout-tail commit: the
  // board carries `generated-by: scripts/render-closeout-board.mjs`, so a commit
  // shipping only the board plus an Ark log is regeneration, not session work.
  // Without these, EVERY closeout tail would raise a corrections warning,
  // because the tail necessarily lands after the SIL write that anchors it.
  /^docs\/CLOSEOUT_STATUS_BOARD\.md$/i,
  /^docs\/CLOSEOUT_BRIEF_/i,
  /\.lock$/i,
];

export function isGeneratedPath(file = '') {
  const p = String(file).replace(/\\/g, '/');
  return GENERATED_PATH_RES.some((re) => re.test(p));
}

// ── S291 [audit #2] — A CORRECTION IS NOT AN OMISSION ────────────────────────
//
// This probe fired `WRITE-BACK DEBT — 3 substantive commits … A session ended
// without running closeout` at the S291 triage, about a session that had closed
// out cleanly. All ten write-back surfaces carried S290. It routed the arc
// toward recovery for work that was already recorded.
//
// The rule above is right and is unchanged: a commit that IS the closeout must
// not count as debt. But it was implemented as a SUBJECT-PREFIX ALLOWLIST
// (`chore(closeout)`), and this repo names closeout commits after the session:
//
//   anchor  dc2ceafa  feat(S290): a census that fails open …     <- writes SIL
//   "debt"  75e7de55  chore(S290): closeout brief, status board  <- IS the closeout
//   "debt"  72e88aa6  chore(S290): correct sessionShellHygiene …
//   "debt"  0f58fe4d  fix(S290): correct the post-closeout claim …
//
// Every one of them names the very session the anchor recorded. The evidence
// that they are not un-written-back work was sitting in the commit subject and
// nothing read it — the S290 #2 shape again (the evidence was already in the
// artifact; no instrument consumed it).
//
// A prefix allowlist cannot be extended into correctness here: the set of
// subjects a closeout may use is open, but the QUESTION is closed — does this
// commit belong to the session the anchor already wrote back? Attribution
// answers it from the commit itself, so no naming convention has to be
// guessed at.
//
// Corrections are NOT silently green. A post-closeout correction that never
// reached the record is a real, lesser problem, so they get their own state
// rather than being folded into either "current" or "debt". It resolves when
// the SIL carries an addendum for that session — the convention the file
// already uses ("### <date> — Session 286 addendum | …").

/**
 * Conventional-commit scope carrying a session id: `feat(S290): …` -> 290.
 *
 * S319 — the optional ` #N` item marker was added on measured evidence. This repo's
 * own convention writes `fix(S318 #5): …` when a commit fixes a numbered audit item,
 * and 8 of the last 300 commits use that form. The scope regex required the scope to
 * END at the session id, so a commit that declared its session MORE precisely was
 * attributed LESS — `sessionOfCommit` returned null, the commit could not be
 * classified as a post-closeout correction, and it was counted as write-back DEBT.
 * Live consequence: `360064a4 fix(S318 #5)` aged past the 12h bar mid-session and
 * ABORTED the S319 closeout with a claim that a session had ended without closing
 * out — about a session that closed out and then corrected itself, which is exactly
 * the state the correction branch below exists to express.
 *
 * Still narrow BY DECLARATION: only a `#<digits>` item marker is admitted inside the
 * scope. Anything else keeps returning null, so prose can never launder itself into
 * an attribution (the reason this regex is anchored at all).
 */
// S341 [audit #6] = [S338 #16] — the bare `S339: …` subject is how real closeout
// commits are written (live anchor 9d116ca2), and it read as null, so the post-closeout
// correction split never ran for them. Admitted ONLY at the very start of the subject;
// the lookaheads verify each whole shape before the one capture, so a mention anywhere
// else ("supersedes S290", `Revert "S290: x"`) still attributes nothing.
export const SESSION_SCOPE_RE = /^(?:[a-z]+\s*\(\s*(?=S\d{1,4}(?:\s+#\d+)?\s*\))|(?=S\d{1,4}(?:\s+#\d+)?:\s))S(\d{1,4})/i;

/**
 * The session a commit is attributed to, or null when it declares none.
 *
 * Narrow BY DECLARATION: only the conventional-commit scope counts. A bare
 * "S290" anywhere in a subject would match prose ("supersedes S290's claim")
 * and would let an unrelated commit launder itself as a correction.
 */
export function sessionOfCommit(commit = {}) {
  const m = SESSION_SCOPE_RE.exec(String(commit.subject || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Does the SIL text record an addendum for this session? That is how a
 * post-closeout correction gets back into the record.
 */
export function hasSessionAddendum(silText = '', session = null) {
  if (!session || !silText) return false;
  return new RegExp(`Session\\s+${session}\\s+addendum`, 'i').test(silText);
}

/**
 * S320 [audit #5] — from a NAMED remedy to a RUNNABLE one.
 *
 * Until this session the probe printed `fix: append a "Session <n> addendum"
 * entry to …` and stopped there. Nothing in the studio ran that fix, so the
 * `corrections-unrecorded` state accumulated silently: the S319 closeout wrote
 * an addendum for S318 by hand, and the S319 correction `b6dc93c5` then landed
 * with no addendum of its own — the same gap, one session later, in the probe
 * whose entire purpose is catching a record that falls behind reality. That is
 * the S311 remediation shape (a correct detector whose remedy nothing executes).
 *
 * The stub is deliberately a STUB. It states only what the probe can prove —
 * which shas landed after which anchor, and that the session did close out —
 * and leaves a marked line for the substance, because a generator that invents
 * the prose would be recording a claim nothing produced. `--fix` makes the
 * record honest about the gap; a human or the session in flight fills in what
 * the correction actually changed.
 */
export function buildSessionAddendum(result = {}, { now = new Date() } = {}) {
  const session = result.anchorSession;
  if (!session || !Array.isArray(result.corrections) || !result.corrections.length) return null;
  const day = now.toISOString().slice(0, 10);
  const anchorSha = result.anchor?.sha || 'unknown';
  const lines = [
    `## ${day} - Session ${session} addendum`,
    '',
    'Recorded because `check-writeback-currency.mjs` reported `corrections-unrecorded`: the',
    `commit(s) below landed after the S${session} SIL anchor \`${anchorSha}\` with no corresponding`,
    `SIL note. **S${session} did close out**; these post-closeout corrections did not reach the`,
    `record. Score, categories and commitments for S${session} are unchanged; this addendum`,
    'exists so the anchor and the tree agree.',
    '',
  ];
  for (const c of result.corrections) {
    lines.push(`- \`${c.sha}\` ${String(c.isoDate || '').slice(0, 10)} — ${c.subject}`);
  }
  lines.push('', '<!-- addendum-substance: what these commits changed, in one paragraph. -->', '');
  return lines.join('\n');
}

/**
 * Insert the addendum immediately AFTER the anchor session's own SIL entry.
 *
 * The SIL is newest-first below the rolling-status block, so "after the anchor
 * session's entry" means "before the next `## ` heading". Anchoring on the
 * session's own heading rather than on a fixed offset keeps this correct when
 * other addenda already sit in the file.
 */
export function insertSessionAddendum(silText = '', addendum = '') {
  if (!addendum) return { changed: false, text: silText, reason: 'no addendum to insert' };
  const lines = String(silText).split('\n');
  const sessionMatch = /^## \d{4}-\d{2}-\d{2}\s*[-—]\s*Session (\d{1,4})\b/;
  const headingIdxs = [];
  lines.forEach((line, i) => { if (sessionMatch.test(line)) headingIdxs.push(i); });
  if (!headingIdxs.length) return { changed: false, text: silText, reason: 'no session heading found in SIL' };
  // First session heading below rolling-status is the newest entry — the anchor's.
  const anchorHeading = headingIdxs[0];
  const nextHeading = headingIdxs.find((i) => i > anchorHeading);
  const insertAt = nextHeading === undefined ? lines.length : nextHeading;
  const block = addendum.split('\n');
  const next = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)];
  return { changed: true, text: next.join('\n'), insertedAtLine: insertAt + 1, reason: 'inserted after the newest session entry' };
}

/** Apply the addendum to the SIL on disk. Idempotent: a recorded session is a no-op. */
export function applySessionAddendum(root = ROOT, result = null, { now = new Date() } = {}) {
  const target = path.join(root, WRITE_BACK_ANCHOR);
  const evaluated = result || run(root);
  if (evaluated.state !== 'corrections-unrecorded') {
    return { applied: false, reason: `nothing to fix — state is "${evaluated.state || (evaluated.ok ? 'current' : 'debt')}"` };
  }
  let silText = '';
  try { silText = fs.readFileSync(target, 'utf8'); } catch {
    return { applied: false, reason: `cannot read ${WRITE_BACK_ANCHOR}` };
  }
  if (hasSessionAddendum(silText, evaluated.anchorSession)) {
    return { applied: false, reason: `S${evaluated.anchorSession} addendum already present` };
  }
  const addendum = buildSessionAddendum(evaluated, { now });
  const inserted = insertSessionAddendum(silText, addendum);
  if (!inserted.changed) return { applied: false, reason: inserted.reason };
  fs.writeFileSync(target, inserted.text);
  return {
    applied: true,
    path: WRITE_BACK_ANCHOR,
    session: evaluated.anchorSession,
    corrections: evaluated.corrections.map((c) => c.sha),
    insertedAtLine: inserted.insertedAtLine,
    reason: inserted.reason,
  };
}

/**
 * S350 [audit #1] — the commit that WRITES a receipt can never carry one.
 *
 * `ROUTINE_AUDIT_CONTRACT.md §6` composes the receipt row and then commits it, so the
 * receipt's `commit` field names the run's *audit* commit and the receipt-tail commit
 * that follows is, by construction, uncoverable. Enforcing receipts without naming that
 * shape made the nightly lane manufacture a permanent phantom debt row every single
 * night — and `writeback-currency` is the one probe whose whole job is to catch a silent
 * cut-off. An instrument that cries wolf nightly is the one nobody reads on the morning
 * it is right.
 *
 * This recognises the tail by SHAPE, not by a time window — a widened window would
 * absolve any commit that merely landed nearby. Three conditions, all structural:
 *   1. the subject is a routine-lane subject,
 *   2. the commit touches ONLY the receipt ledger — its entire content is a receipt, and
 *   3. some receipted routine commit is older than it, so a run it could tail exists.
 * A tail with no run behind it stays debt.
 */
export function receiptTailShas(commits = [], routineReceipts = []) {
  const ordered = Array.isArray(commits) ? commits : [];
  const receiptedMs = ordered
    .filter((commit) => findRoutineReceipt(commit, routineReceipts))
    .map((commit) => Date.parse(commit.isoDate || ''))
    .filter(Number.isFinite);
  if (!receiptedMs.length) return new Set();
  const oldestReceiptedMs = Math.min(...receiptedMs);
  const tails = new Set();
  for (const commit of ordered) {
    if (!ROUTINE_AUTOMATION_SUBJECT_RE.test(String(commit.subject || ''))) continue;
    const files = (Array.isArray(commit.files) ? commit.files : []).map((f) => String(f).replace(/\\/g, '/'));
    if (files.length !== 1 || files[0] !== ROUTINE_SESSION_RECEIPT_LEDGER) continue;
    const commitMs = Date.parse(commit.isoDate || '');
    if (!Number.isFinite(commitMs) || commitMs < oldestReceiptedMs) continue;
    tails.add(String(commit.sha || '').toLowerCase());
  }
  return tails;
}

/**
 * A commit counts as SUBSTANTIVE session work when it is not an automation-lane
 * subject AND it touches at least one non-generated file.
 */
export function isSubstantiveCommit(commit = {}, routineReceipts = [], receiptTails = null) {
  const subject = String(commit.subject || '');
  if (AUTOMATION_SUBJECT_RE.test(subject)) {
    if (!ROUTINE_AUTOMATION_SUBJECT_RE.test(subject)) return false;
    const commitMs = Date.parse(commit.isoDate || '');
    if (!Number.isFinite(commitMs) || commitMs < ROUTINE_RECEIPT_ENFORCEMENT_AT) return false;
    if (receiptTails?.has(String(commit.sha || '').toLowerCase())) return false;
    return !findRoutineReceipt(commit, routineReceipts);
  }
  const files = Array.isArray(commit.files) ? commit.files : [];
  if (!files.length) return false; // empty/merge commit — nothing to write back
  return files.some((f) => !isGeneratedPath(f));
}

/**
 * Pure core. `commits` is newest-first, each { sha, subject, isoDate, files[] }.
 *
 * @param {number} staleHours grace window: a session that just committed and is
 *   still running has legitimate un-written-back work. Only once the newest
 *   substantive commit is older than this do we call it an abandoned closeout.
 *   Bounded AGE, never calendar-day identity (S266 freshness rule).
 */
function evaluateWriteBackAge({ commits = [], nowMs = null, staleHours = 12, silText = '', routineReceipts = [] } = {}) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const receiptTails = receiptTailShas(commits, routineReceipts);
  const enforcedRoutineCommits = commits.filter((commit) =>
    ROUTINE_AUTOMATION_SUBJECT_RE.test(String(commit.subject || ''))
    && Date.parse(commit.isoDate || '') >= ROUTINE_RECEIPT_ENFORCEMENT_AT);
  const recordedRoutineCount = enforcedRoutineCommits.filter((commit) =>
    findRoutineReceipt(commit, routineReceipts)
    || receiptTails.has(String(commit.sha || '').toLowerCase())).length;
  const routineReceiptSummary = {
    routineReceiptLedger: ROUTINE_SESSION_RECEIPT_LEDGER,
    routineReceiptCount: routineReceipts.length,
    recordedRoutineCount,
    receiptTailCount: receiptTails.size,
    unrecordedRoutineCount: enforcedRoutineCommits.length - recordedRoutineCount,
  };
  const anchorIdx = commits.findIndex((c) =>
    (c.files || []).some((f) => String(f).replace(/\\/g, '/') === WRITE_BACK_ANCHOR));

  if (anchorIdx === -1) {
    return {
      ok: true,
      inFlight: false,
      debtCount: 0,
      anchor: null,
      reason: `no ${WRITE_BACK_ANCHOR} commit in the inspected range — cannot measure write-back currency`,
      unmeasured: true,
      debt: [],
      ...routineReceiptSummary,
    };
  }

  const anchor = commits[anchorIdx];
  const anchorSession = sessionOfCommit(anchor);
  const after = commits.slice(0, anchorIdx).filter((commit) => isSubstantiveCommit(commit, routineReceipts, receiptTails));

  // S291 [audit #2] — split by attribution before judging anything. A commit
  // scoped to the session the anchor recorded is a correction to a CLOSED
  // session, not evidence that a session never closed.
  const corrections = anchorSession === null
    ? []
    : after.filter((c) => sessionOfCommit(c) === anchorSession);
  const correctionShas = new Set(corrections.map((c) => c.sha));
  const debt = after.filter((c) => !correctionShas.has(c.sha));

  const brief = (c) => ({ sha: c.sha, subject: c.subject, isoDate: c.isoDate });
  const correctionsRecorded = corrections.length
    ? hasSessionAddendum(silText, anchorSession)
    : true;
  const correctionBlock = {
    anchorSession,
    corrections: corrections.map(brief),
    correctionCount: corrections.length,
    correctionsRecorded,
  };

  if (!debt.length && corrections.length && !correctionsRecorded) {
    // Not debt — the session closed out. But the corrections that landed after
    // it are absent from the record, which is its own (non-blocking) finding.
    return {
      ok: true,
      inFlight: false,
      unmeasured: false,
      debtCount: 0,
      debt: [],
      state: 'corrections-unrecorded',
      ...correctionBlock,
      anchor: brief(anchor),
      reason: `write-back current — but ${corrections.length} post-closeout correction(s) to `
        + `S${anchorSession} landed after the anchor (${anchor.sha}) and the SIL carries no `
        + `S${anchorSession} addendum. The session DID close out; the corrections did not reach the record.`,
      ...routineReceiptSummary,
    };
  }

  if (!debt.length) {
    return {
      ok: true,
      inFlight: false,
      debtCount: 0,
      anchor: brief(anchor),
      state: 'current',
      ...correctionBlock,
      reason: corrections.length
        ? `write-back current — ${corrections.length} post-closeout correction(s) to S${anchorSession} `
          + 'are covered by a SIL addendum'
        : `write-back current — no substantive commits since ${anchor.sha} (${anchor.isoDate})`,
      unmeasured: false,
      debt: [],
      ...routineReceiptSummary,
    };
  }

  // AGE IS MEASURED FROM THE **OLDEST** UN-WRITTEN-BACK COMMIT, not the newest.
  // Anchoring on the newest lets a single fresh commit mask days-old debt behind
  // it — the exact way the live incident stayed invisible: work from 2026-08-06
  // sat un-written-back while 2026-08-07 commits kept the "newest" age at ~1h.
  // A genuinely in-flight session has ALL its commits inside the grace window,
  // so oldest-anchoring stays correct for the in-flight case and strictly
  // stronger for the abandoned-closeout case.
  const newest = debt[0];
  const oldest = debt[debt.length - 1];
  const oldestMs = Date.parse(oldest.isoDate);
  const ageHours = Number.isFinite(oldestMs) ? (now - oldestMs) / 3_600_000 : Infinity;
  const inFlight = ageHours < staleHours;

  return {
    ok: inFlight,
    inFlight,
    unmeasured: false,
    debtCount: debt.length,
    ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(1)) : null,
    staleHours,
    anchor: brief(anchor),
    state: inFlight ? 'in-flight' : 'debt',
    ...correctionBlock,
    newest: brief(newest),
    oldest: brief(oldest),
    debt: debt.map(brief),
    ...routineReceiptSummary,
    reason: inFlight
      ? `${debt.length} substantive commit(s) since last closeout write-back (${anchor.sha}), oldest ${ageHours.toFixed(1)}h old — session likely in flight`
      : `WRITE-BACK DEBT — ${debt.length} substantive commit(s) landed after the last closeout write-back (${anchor.sha}, ${anchor.isoDate}); oldest is ${ageHours.toFixed(1)}h old (≥${staleHours}h). A session ended without running closeout.`,
  };
}

/** Session evidence distinguishes a missing owner from a merely young commit. */
export function readWriteBackLock(root, { readFileSync = fs.readFileSync } = {}) {
  let raw;
  try { raw = readFileSync(path.join(root, 'context/.session-lock'), 'utf8'); }
  catch (error) { return { state: error.code === 'ENOENT' ? 'absent' : 'unknown', session: null, sessionStart: null }; }
  const values = parseSessionLock(raw);
  const match = /^S?(\d+)$/.exec(values.session_id || '');
  const startMs = Date.parse(values.session_start || '');
  return { state: 'present', session: match ? Number(match[1]) : null,
    sessionStart: Number.isFinite(startMs) ? values.session_start : null,
    sessionStartMs: Number.isFinite(startMs) ? startMs : null };
}

export function evaluateWriteBackCurrency(options = {}) {
  const result = evaluateWriteBackAge(options);
  const lock = options.sessionLock;
  const newestSession = latestSilSession(options.silText || '');
  const debt = result.debt || [];
  const oldestMs = Date.parse(result.oldest?.isoDate || '');
  const signals = {
    lock_absent: lock?.state === 'absent',
    lock_postdates_debt: lock?.state === 'present' && Number.isFinite(lock.sessionStartMs)
      && Number.isFinite(oldestMs) && lock.sessionStartMs > oldestMs,
    label_ahead: debt.map(c => ({ sha: c.sha, declared: sessionOfCommit(c) }))
      .filter(c => c.declared !== null && newestSession !== null && c.declared > newestSession),
  };
  // A correctly owned in-flight session naturally has a label ahead of SIL.
  // Publish that fact, but do not call its own current work an abandoned session.
  const unownedLabels = signals.label_ahead.filter(c => lock?.state === 'present'
    && Number.isFinite(lock.session) && c.declared !== lock.session);
  const reasons = [];
  if (signals.lock_absent) reasons.push('no session lock on disk');
  if (signals.lock_postdates_debt) reasons.push('session lock was written after the oldest debt commit');
  if (unownedLabels.length) reasons.push('unrecorded session labels are not owned by the current session lock');
  const cutOff = !result.unmeasured && debt.length > 0 && reasons.length > 0;
  return { ...result, cutOff, cutoffSignals: signals,
    sessionLock: lock || { state: 'unknown' }, newestRecordedSession: newestSession,
    ...(cutOff ? { ok: false, inFlight: false, state: 'cut-off',
      reason: 'WRITE-BACK DEBT — cut off: ' + reasons.join('; ') + '. ' + debt.length + ' substantive commit(s) remain unrecorded.' } : {}) };
}

/**
 * S347 [audit #2] — closes [SIL:2⛔][S309 #1]. A currency verdict measured on a
 * tree that is BEHIND its upstream measures divergence, not debt: S309 reported
 * 71.7h on a tree 17 commits behind origin, and the honest figure after rebase
 * was 18.6h. The probe cannot know which unfetched commits would have cleared
 * the anchor, so it does not recompute — it LABELS. A behind-tree verdict carries
 * `syncState.state: 'behind'` and `preSync: true`, and its reason says so.
 *
 * Reading the tracking ref is local (no network). `--fetch` refreshes it first;
 * without it a stale tracking ref can still under-report `behind`, which the
 * label states as `fetched: false`.
 */
export function readSyncState(root = ROOT, { fetch = false } = {}) {
  let fetched = false;
  if (fetch) {
    const f = spawnSync('git', ['fetch', '-q'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
    fetched = f.status === 0;
  }
  const up = spawnSync('git', GIT_UPSTREAM_REF_ARGS, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (up.status !== 0) return { state: 'no-upstream', upstream: null, ahead: null, behind: null, fetched };
  const upstream = String(up.stdout || '').trim();
  const cnt = spawnSync('git', ['rev-list', '--left-right', '--count', '@{u}...HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const m = /^(\d+)\s+(\d+)/.exec(String(cnt.stdout || '').trim());
  if (cnt.status !== 0 || !m) return { state: 'unknown', upstream, ahead: null, behind: null, fetched };
  const behind = Number(m[1]);
  const ahead = Number(m[2]);
  return { state: behind > 0 ? 'behind' : 'synced', upstream, ahead, behind, fetched };
}

/** Attach the sync label to a verdict. Pure; never changes ok/debt — only what they claim. */
export function labelSyncState(result = {}, sync = null) {
  if (!sync) return result;
  const out = { ...result, syncState: sync };
  if (sync.state === 'behind') {
    out.preSync = true;
    const note = ` PRE-SYNC: tree is ${sync.behind} commit(s) behind ${sync.upstream}${sync.fetched ? '' : ' (tracking ref not refreshed — run with --fetch)'}; this verdict measures divergence until you pull --rebase and re-run.`;
    out.reason = `${out.reason || ''}${note}`;
  } else {
    out.preSync = false;
  }
  return out;
}

/** Actionable repair steps — the surfaces a skipped closeout left behind. */
export function repairPlanForWriteBackCurrency(result = {}) {
  if (result.ok || !result.debtCount) return [];
  const range = result.anchor ? `${result.anchor.sha}..HEAD` : 'HEAD~20..HEAD';
  return [
    { step: 'reconstruct', action: `Read the un-written-back work: git log --stat ${range}` },
    { step: 'CURRENT_STATE', action: 'context/CURRENT_STATE.md — describe the shipped behaviour those commits changed.' },
    { step: 'LATEST_HANDOFF', action: 'context/LATEST_HANDOFF.md — prepend the authoritative handoff for the recovered session.' },
    { step: 'WORK_LOG', action: 'logs/WORK_LOG.md — append the session entry.' },
    { step: 'DECISIONS', action: 'context/DECISIONS.md — append any decisions those commits encode (append-only).' },
    { step: 'SELF_IMPROVEMENT_LOOP', action: 'context/SELF_IMPROVEMENT_LOOP.md — append the SIL entry; this is the anchor that clears this probe.' },
    { step: 'PROJECT_STATUS', action: 'context/PROJECT_STATUS.json — refresh currentFocus/lastUpdated (CANON-031 invariant holds).' },
  ];
}

/** Read commits from git. Newest-first, with the file list per commit. */
export function readCommits(root = ROOT, limit = 60) {
  const res = spawnSync('git', ['log', `-${limit}`, '--name-only', '--date=iso-strict',
    '--format=%x00%H%x1f%ad%x1f%s'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) return [];
  const commits = [];
  for (const block of String(res.stdout || '').split('\0')) {
    if (!block.trim()) continue;
    const [header, ...rest] = block.split('\n');
    const [sha, isoDate, subject] = header.split('\x1f');
    if (!sha) continue;
    commits.push({
      sha: sha.slice(0, 8),
      isoDate: (isoDate || '').trim(),
      subject: (subject || '').trim(),
      files: rest.map((l) => l.trim()).filter(Boolean),
    });
  }
  return commits;
}

export function run(root = ROOT, opts = {}) {
  if (!fs.existsSync(path.join(root, '.git'))) {
    return { ok: true, unmeasured: true, debtCount: 0, debt: [], reason: 'not a git repository — write-back currency unmeasured' };
  }
  // S291 [audit #2] — the SIL text is how a post-closeout correction proves it
  // reached the record. Unreadable SIL means we cannot confirm an addendum, so
  // corrections stay reported rather than silently resolving.
  let silText = '';
  try { silText = fs.readFileSync(path.join(root, WRITE_BACK_ANCHOR), 'utf8'); } catch { silText = ''; }
  const routineReceipts = readRoutineReceipts(root).rows;
  const result = evaluateWriteBackCurrency({ commits: readCommits(root, opts.limit || 60), silText, routineReceipts, sessionLock: readWriteBackLock(root), ...opts });
  return labelSyncState(result, opts.syncState === undefined ? readSyncState(root, { fetch: Boolean(opts.fetch) }) : opts.syncState);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const projectIndex = process.argv.indexOf('--project');
  const projectArg = projectIndex >= 0 ? process.argv[projectIndex + 1] : null;
  if (projectIndex >= 0 && (!projectArg || projectArg.startsWith('--'))) {
    console.error('--project requires a repository path'); process.exit(2);
  }
  const targetRoot = path.resolve(projectArg || process.cwd());
  const result = run(targetRoot, { fetch: process.argv.includes('--fetch') });
  if (FIX) {
    const applied = applySessionAddendum(targetRoot, result);
    if (JSON_OUT) console.log(JSON.stringify({ ...result, fix: applied }));
    else if (applied.applied) {
      console.log(`✓ writeback-currency --fix: appended a Session ${applied.session} addendum to ${applied.path} (line ${applied.insertedAtLine})`);
      console.log(`   corrections recorded: ${applied.corrections.join(', ')}`);
      console.log('   the stub states only what is provable — fill the marked substance line before closeout.');
    } else console.log(`· writeback-currency --fix: ${applied.reason}`);
    process.exit(applied.applied ? 0 : (result.ok ? 0 : 1));
  }
  const payload = EXPLAIN ? { ...result, repairPlan: repairPlanForWriteBackCurrency(result) } : result;
  if (JSON_OUT) console.log(JSON.stringify(payload));
  else {
    const glyph = result.state === 'corrections-unrecorded' ? '⚠' : (result.ok ? '✓' : '⛔');
    console.log(`${glyph} writeback-currency: ${result.reason}`);
    if (!result.ok) for (const c of result.debt) console.log(`   · ${c.sha} ${c.isoDate.slice(0, 10)} ${c.subject}`);
    if (result.state === 'corrections-unrecorded') {
      for (const c of result.corrections) console.log(`   · ${c.sha} ${c.isoDate.slice(0, 10)} ${c.subject}`);
      console.log(`   fix: append a "Session ${result.anchorSession} addendum" entry to ${WRITE_BACK_ANCHOR}.`);
    }
    if (EXPLAIN) for (const s of repairPlanForWriteBackCurrency(result)) console.log(`- ${s.step}: ${s.action}`);
  }
  process.exit(result.ok ? 0 : 1);
}
