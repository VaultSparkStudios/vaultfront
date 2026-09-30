// Resource-ratio persistence and reporting. Token consumption does not establish
// output quality, wasted work, or a requirement to extend a session.
import { strictNumber } from './strict-number.mjs';
import { spawnSync } from './safe-spawn.mjs';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootAmortization } from './session-economics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');

export const HISTORY_CAP = 10;
export const MIN_SAMPLES_TO_WARN = 3;     // never warn on < 3 measured samples
export const WASTED_AVG_BAND = 1.5;        // trailing measured avg < this (thin/wasted) → warn

// Read the live context-meter and classify this session's boot amortization. Returns the same shape
// as bootAmortization() plus the raw token inputs (for transparency in the persisted record).
export function liveAmortization(root = ROOT) {
  // S264: `j.usedTokens ?? 0` was the S262 non-measurement class again — a null
  // meter reading became workTokens=0 → ratio=0 → a MEASURED-looking "wasted"
  // verdict. 9 of the 10 live history rows were fabricated zeros, and the
  // boot-amortization probe was chronic-red on data that never existed. A
  // non-measurement must reach bootAmortization as unmeasured (ratio:null).
  let usedTokens = null, startupTokens = 0;
  try {
    const out = spawnSync('node', [path.join(root, 'scripts', 'context-meter.mjs'), '--json'], { encoding: 'utf8' });
    const j = JSON.parse(out.stdout);
    const measured = j.measured_ok !== false && j.usedTokens != null;
    if (measured) {
      usedTokens = j.usedTokens;
      startupTokens = j.freshSessionBootstrap ?? 0;
    }
  } catch { /* unmeasured → unknown below */ }
  if (usedTokens == null) {
    return { ...bootAmortization({ workTokens: 0, startupTokens: 0 }), workTokens: null, startupTokens: null };
  }
  // S317 [audit #8] — a BELOW-DENOMINATOR reading is unmeasured, not zero.
  //
  // S264 fixed `usedTokens ?? 0` fabricating zeros from a null meter. This clamp
  // reintroduced the identical shape from the other side: when usedTokens <=
  // startupTokens the subtraction goes negative, Math.max floors it to 0, and a
  // ratio of exactly 0 is published as a MEASURED verdict. Three such rows exist —
  // 19:57, 20:04 and 20:10 on 2026-09-01, three samples in thirteen minutes — and
  // they alone drag the trailing average from 0.33 to 0.23, which is the number the
  // probe then reports as "sessions ending before amortizing their boot".
  //
  // usedTokens below the bootstrap estimate does not mean no work happened; it
  // means the two numbers are not comparable on this reading. Say so.
  if (usedTokens <= startupTokens) {
    return {
      ...bootAmortization({ workTokens: 0, startupTokens: 0 }),
      workTokens: null,
      startupTokens,
      unmeasuredReason: `usedTokens (${usedTokens}) is at or below the bootstrap estimate (${startupTokens}) — not comparable, not zero`,
    };
  }
  const workTokens = usedTokens - startupTokens;
  const amort = bootAmortization({ workTokens, startupTokens });
  return { ...amort, workTokens, startupTokens };
}

export function inferTrigger(meta = {}, env = process.env) {
  return meta.trigger
    || meta.triggerType
    || env.TRIGGER_TYPE
    || env.SESSION_TRIGGER
    || env.STUDIO_SESSION_TRIGGER
    || env.CODEX_SESSION_TRIGGER
    || env.CLAUDE_SESSION_TRIGGER
    || env.GITHUB_EVENT_NAME
    || '';

}
export function isScheduledTrigger(trigger) {
  // S240 [audit #10] — `scheduled-routine` is the typed value the session-lock
  // contract uses (trigger: founder-mission | recovery | scheduled-routine | ad-hoc).
  return /^(schedule|scheduled|scheduled-routine|routine|cron|timer|workflow_dispatch:scheduled)$/i.test(String(trigger || ''));
}

// S240 [audit #10] — session-lock trigger provenance. The lock is the one
// surface EVERY agent (Claude Code, Codex, cloud routines) writes at start, so
// a typed `trigger:` row there classifies the whole session without needing
// env vars to survive into every child process. Returns '' when absent.
export function readLockTrigger(root = ROOT) {
  try {
    const lock = fsSync.readFileSync(path.join(root, 'context', '.session-lock'), 'utf8');
    const m = lock.match(/^trigger:\s*(\S+)/m);
    return m ? m[1] : '';
  } catch { return ''; }
}

// S248 [audit #3] — trigger provenance loss root-fix. The lock is cleared by the
// harness's global Stop hook, so a closeout/finalize that runs AFTER the hook
// (the S247 23:09 row's fingerprint) reads no lock and records an untyped row
// even though the session WAS typed. Fix: capture the typed trigger to a
// session cache WHILE the lock exists (every context-meter/closeout touchpoint),
// and resolve from that cache when the lock is already gone. The cache carries
// the lock's session_start + capture time so a stale value never leaks across
// sessions (24h fence); an unresolvable trigger stays honestly empty.
const TRIGGER_CACHE_REL = path.join('.cache', 'session-trigger.json');

export function captureLockTrigger(root = ROOT) {
  const trigger = readLockTrigger(root);
  if (!trigger) return '';
  try {
    const lock = fsSync.readFileSync(path.join(root, 'context', '.session-lock'), 'utf8');
    const sessionStart = lock.match(/^session_start:\s*(\S+)/m)?.[1] ?? null;
    fsSync.mkdirSync(path.join(root, '.cache'), { recursive: true });
    fsSync.writeFileSync(path.join(root, TRIGGER_CACHE_REL),
      JSON.stringify({ trigger, sessionStart, capturedAt: new Date().toISOString() }, null, 2) + '\n');
  } catch { /* capture is best-effort; the live lock read below still works */ }
  return trigger;
}

export function resolveSessionTrigger(root = ROOT, { maxAgeHours = 24 } = {}) {
  const live = readLockTrigger(root);
  if (live) return live;
  try {
    const j = JSON.parse(fsSync.readFileSync(path.join(root, TRIGGER_CACHE_REL), 'utf8'));
    if (j?.trigger && Number.isFinite(Date.parse(j.capturedAt))
      && Date.now() - Date.parse(j.capturedAt) < maxAgeHours * 3600 * 1000) return j.trigger;
  } catch { /* no cache → honestly unknown */ }
  return '';
}

// PURE: stamp `status.bootAmortization` and push onto a bounded `status.bootAmortizationHistory`.
// `ranAt` is passed in (no clock here — the caller stamps it, keeping this unit-testable). Mutates
// and returns the status object.
export function recordAmortization(status, amort, ranAt, cap = HISTORY_CAP, meta = {}) {
  const trigger = inferTrigger({ ...meta, trigger: amort.trigger ?? meta.trigger });
  const scheduled = isScheduledTrigger(trigger);
  const record = {
    ratio: Number.isFinite(amort.ratio) && amort.ratio >= 0 ? amort.ratio : null,
    verdict: scheduled ? 'scheduled-routine' : (Number.isFinite(amort.ratio) ? 'resource-ratio' : 'unknown'),
    ranAt,
    ...(trigger ? { trigger } : {}),
  };
  status.bootAmortization = record;
  const hist = Array.isArray(status.bootAmortizationHistory) ? status.bootAmortizationHistory : [];
  // S317 [audit #8] — ROWS ARE NOT SESSIONS, and they were being counted as if
  // they were. A row is pushed per non-dry autopilot run, so S309 carries three,
  // S312 three, S314 three, S315 two — the ten-row trailing window covers roughly
  // four to five sessions, and an ABORTED closeout contributes a row of its own.
  // The rows also carried no session number at all, which is the S305 stamp rule.
  //
  // Stamp the session and REPLACE its row rather than appending, so one session
  // contributes one sample. Without a session the old append behaviour is kept —
  // an unstamped row is not evidence about any particular session, and dropping it
  // silently would be worse than counting it once.
  // S351 [audit #6] — the guard above this line SAYS an unstamped row must be
  // appended, and `Number.isFinite(Number(null))` is TRUE (null coerces to 0), so
  // a null session took the replace-at-session-0 branch instead: every unstamped
  // row collided into one slot and overwrote the last. Latent, not observed live
  // (all 10 current rows are stamped), but it is the same coercion that cost the
  // closeout-autopilot probe 273 phantom bypasses this session.
  // S351 [self-audit] — this line first hoisted the value into a local and
  // re-derived the check inline. That was correct but UNPROTECTED: the
  // null-vs-absent coercion rule matches a property access, so hoisting to a
  // local hides the identical defect from the lint that exists to catch it.
  // One shared predicate, in a file that is tested directly.
  const session = strictNumber(meta.session);
  if (session !== null) {
    record.session = session;
    const at = hist.findIndex((h) => strictNumber(h?.session) === session);
    if (at >= 0) hist[at] = record; else hist.push(record);
  } else {
    hist.push(record);
  }
  status.bootAmortizationHistory = hist.slice(-cap);
  return status;
}

// PURE: is a history row UNTYPED — a measured (non-scheduled) session that carries no `trigger:`
// provenance at all? These are the S240 defect's fingerprint: a scheduled/cloud routine whose lock
// never stamped `trigger: scheduled-routine`, so it reads as an anonymous founder boot. We CANNOT
// prove it was a routine (that would be fabrication), only that its provenance is unknown.
function isUntyped(h) {
  if (!h) return false;
  if (h.verdict === 'scheduled-routine' || isScheduledTrigger(h.trigger)) return false; // typed-scheduled
  return !h.trigger; // measured but no trigger row → provenance unknown
}

// PURE: trailing average over MEASURED (non-null) ratios only. Returns { avg, samples, scheduledCount,
// untyped } — avg is null when there are no measured samples (an honestly unmeasurable history, never
// a warning). `untyped` counts measured samples with no `trigger:` provenance (S245 [audit R08]).
export function trailingMeasuredAvg(history = []) {
  const arr = Array.isArray(history) ? history : [];
  const scheduledCount = arr.filter(h => h?.verdict === 'scheduled-routine' || isScheduledTrigger(h?.trigger)).length;
  const measuredRows = arr.filter(h => h?.verdict !== 'scheduled-routine' && !isScheduledTrigger(h?.trigger) && h && Number.isFinite(h.ratio) && h.ratio >= 0);
  const untyped = measuredRows.filter(isUntyped).length;
  const measured = measuredRows.map(h => h.ratio);
  if (!measured.length) return { avg: null, samples: 0, scheduledCount, untyped };
  const avg = measured.reduce((a, b) => a + b, 0) / measured.length;
  return { avg: Math.round(avg * 100) / 100, samples: measured.length, scheduledCount, untyped };
}

// Historical ratios stay readable; this probe makes no outcome/value inference.
export function amortizationProbe(history = []) {
  const { avg, samples, scheduledCount, untyped } = trailingMeasuredAvg(history);
  const resource = avg == null ? 'unmeasured' : avg + '×';
  return { pass: true, warn: false, detail: 'work/startup token ratio '+resource+' over '+samples+' samples · '+scheduledCount+' scheduled routine(s) excluded · '+untyped+' untyped · resource use only; outcome not assessed', avg, samples, scheduledCount, untyped };
}

export default { liveAmortization, recordAmortization, trailingMeasuredAvg, amortizationProbe, inferTrigger, isScheduledTrigger, readLockTrigger, HISTORY_CAP, MIN_SAMPLES_TO_WARN, WASTED_AVG_BAND };
