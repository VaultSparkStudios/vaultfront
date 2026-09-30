// brief-preflight.mjs — S244 [audit #2, closes SIL:1 S240 #1 / S220-F1 final step].
//
// The v3 startup-brief renderer historically carried three LOAD-BEARING preflight
// side-effects inline: (1) `doctor --fix --update-json --quiet` so the SIGNALS
// box reflects the doctor run the brief itself triggered (S173, CANON-031),
// (2) fixLastSessionSummary() so the brief never replays stale closeout prose
// (S210), and (3) the SIGNALS.md artifact write (S220 #7). That inlining was the
// named blocker for promoting brief-v5: the `--v5` / `BRIEF_V5=1` early-delegate
// path bypassed v3 entirely and silently skipped all three.
//
// This lib is the single shared pre-render step. BOTH renderers call it, so the
// side-effects run no matter which renderer produces the canonical brief.
// Freshness-gated (default 5 min) so the flag-file flow — v3 renders, then
// spawns v5 for the guarded promotion copy — doesn't run the doctor twice.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from './safe-spawn.mjs';
import { fileURLToPath } from 'node:url';
import { fix as fixLastSessionSummary } from '../check-last-session-summary.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(__dirname, '..');

const STAMP_REL = path.join('.cache', 'brief-preflight-last.json');
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Run the shared brief preflight. Idempotent within ttlMs (stamp file).
 * Never throws — a broken preflight must never block a brief render.
 * Returns { ran, reason, steps } for observability/tests.
 */
export function runBriefPreflight(root, { force = false, ttlMs = DEFAULT_TTL_MS, mode = 'maintain' } = {}) {
  // Routine delivery reads cached evidence. Do not mutate maintenance stamps or
  // imply that skipped checks ran, even when force was also supplied.
  if (mode === 'deliver') return { ran: false, reason: 'deliver: cached evidence; maintenance not run', steps: [] };
  const stampPath = path.join(root, STAMP_REL);
  if (!force) {
    try {
      const last = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
      if (Date.now() - Date.parse(last.at) < ttlMs) {
        return { ran: false, reason: `fresh (<${Math.round(ttlMs / 60000)}min)`, steps: [] };
      }
    } catch { /* no stamp → run */ }
  }

  const steps = [];

  // (1) doctor --fix --update-json — persist the freshly-computed score so the
  // brief never surfaces a phantom ⛔ a live doctor no longer agrees with.
  if (!process.env.STUDIO_BRIEF_NO_DOCTOR_FIX) {
    try {
      spawnSync(process.execPath, [path.join(SCRIPTS, 'ops.mjs'), 'doctor', '--fix', '--update-json', '--quiet'], {
        cwd: root, stdio: 'ignore', timeout: 30000, windowsHide: true,
      });
      steps.push('doctor-fix-update-json');
    } catch { /* non-fatal */ }
  }

  // (2) last-session-summary self-heal — durable SIL/currentFocus spine wins
  // over stale closeout prose.
  try {
    fixLastSessionSummary(root);
    steps.push('fix-last-session-summary');
  } catch { /* non-fatal */ }

  // (2.5) audit premise-decay check ([SIL][S245 #1], shipped S247) — verify the
  // latest AUDIT_<date>.json sidecar's typed premises against live code so decay
  // surfaces in the brief instead of being rediscovered mid-implement. Cache is
  // consumed by render-startup-brief-v5 as a SIGNALS row. Never blocks a render.
  try {
    // S319 [audit #3] — the cap is DECLARED to the checker, not just enforced on it.
    // Told nothing, it started a full doctor run it could never finish inside 30s and
    // was killed with nothing to show, every session since S289. Given the budget it
    // resolves only the probe ids the sidecar names (measured: 19.3s cold, 0.5s warm).
    const PREMISE_BUDGET_MS = 30000;
    const r = spawnSync(process.execPath, [
      path.join(SCRIPTS, 'check-audit-premises.mjs'), '--json', '--budget-ms', String(PREMISE_BUDGET_MS),
    ], {
      cwd: root, encoding: 'utf8', timeout: PREMISE_BUDGET_MS, windowsHide: true,
    });
    const j = JSON.parse(r.stdout || '{}');
    if (j && (j.verified != null || j.contradicted != null)) {
      // Premise semantics: an item's premises assert the PROBLEM state, so once
      // the item ships its premises legitimately flip to contradicted — that is
      // confirmation, not decay. Real decay = a contradicted premise on an item
      // with NO outcome yet (the plan is stale before anyone acted on it).
      const openContradicted = j.openContradicted ?? j.contradicted ?? 0;
      fs.writeFileSync(path.join(root, '.cache', 'audit-premise-decay.json'), JSON.stringify({
        at: new Date().toISOString(),
        audit: j.audit || j.file || null,
        verified: j.verified ?? 0,
        contradicted: j.contradicted ?? 0,
        resolvedContradicted: j.resolvedContradicted ?? 0,
        openContradicted,
        unverified: j.unverified ?? 0,
        // S317 [audit #2] — carry the CAUSE, not just the count. The brief used to
        // print one hardcoded explanation for "nothing resolved" and published the
        // wrong diagnosis when the cause changed. null when everything resolved.
        unresolvedCause: j.unresolvedCause ?? null,
      }, null, 2));
      steps.push('audit-premise-decay');
    } else {
      // S289 [audit item 2] — a check that did not COMPLETE must not vanish.
      //
      // check-audit-premises spawns a full run-doctor to gather evidence. When the
      // doctor cache is cold that exceeds this 30s timeout, stdout is empty, the guard
      // above fails, and the row simply disappeared from the brief — silently, because
      // the surrounding catch swallows everything. An absent row reads as "nothing to
      // report", which is the same unknown-as-green conflation this item exists to
      // close, just expressed as omission instead of a checkmark. Record the
      // non-measurement so the brief can say so.
      fs.writeFileSync(path.join(root, '.cache', 'audit-premise-decay.json'), JSON.stringify({
        at: new Date().toISOString(),
        audit: null,
        incomplete: true,
        reason: r.error ? String(r.error.code ?? r.error.message) : r.status === null ? 'timed-out' : `exit ${r.status}`,
      }, null, 2));
      steps.push('audit-premise-decay:incomplete');
    }
  } catch { /* non-fatal */ }

  try {
    fs.mkdirSync(path.dirname(stampPath), { recursive: true });
    fs.writeFileSync(stampPath, JSON.stringify({ at: new Date().toISOString(), steps }, null, 2));
  } catch { /* stamp is advisory */ }

  return { ran: true, reason: force ? 'forced' : 'stale-or-first', steps };
}

/**
 * (3) SIGNALS.md write-or-retire — persist the composed SIGNALS rows verbatim as
 * context/SIGNALS.md, the single-file artifact consumed by generate-genius-list,
 * render-revenue-signals, compile-consumption-feeds and the v5 fallback resolver.
 * Advisory: never blocks a render. Shared so whichever renderer composes the
 * rows keeps every downstream consumer fresh.
 */
export function writeSignalsArtifact(root, rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  try {
    fs.writeFileSync(path.join(root, 'context', 'SIGNALS.md'), rows.join('\n') + '\n');
    return true;
  } catch { return false; }
}
