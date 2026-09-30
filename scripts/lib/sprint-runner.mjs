/**
 * sprint-runner.mjs — Shared sequencing/gating core for /go and /implement (G8, S118).
 *
 * Both skills follow the same loop:
 *   for each item:
 *     surface "[#N] starting"
 *     run perItem(item)            ← skill-specific work
 *     context-meter gate           ← CONTINUE | CONSIDER_CLOSEOUT | CLOSEOUT
 *     record outcome
 *     status-flip in source-of-truth
 *
 * Differences:
 *   /go      pulls items from .cache/genius-list.json     (source: 'genius-list')
 *   /implement pulls items from latest docs/AUDIT_*.json  (source: 'audit')
 *
 * This lib factors out the loop so the protocol-level skills stay thin and
 * any improvement (gate logic, telemetry, twin integration) lands in one place.
 *
 * Usage:
 *   import { runSprint } from './lib/sprint-runner.mjs';
 *   await runSprint({
 *     skill: 'go',
 *     sessionId: '118',
 *     items: [...],
 *     perItem: async (item) => { ... do the work ...; return { status: 'shipped' }; },
 *     gate: async () => readContextMeter(),
 *     onShipped: (item, result) => recordGeniusOutcome(...),
 *   });
 */

import { spawnSync } from './safe-spawn.mjs';
import path from 'path';
import { profileFor } from '../arc-profile.mjs';
import { runMediaGate } from './media-quality-gate.mjs';
import { startTrace, recordStep, finishTrace } from './skill-trace.mjs';

function readContextMeterDefault() {
  try {
    const out = spawnSync('node', ['scripts/context-meter.mjs', '--json'], { encoding: 'utf8' });
    return JSON.parse(out.stdout || '{}');
  } catch {
    return { recommendation: 'CONTINUE', pctUsed: 0 };
  }
}

/**
 * @param {object} cfg
 * @param {'go'|'implement'} cfg.skill
 * @param {string} cfg.sessionId
 * @param {Array<{id, title, slug?, axis?, effortHours?}>} cfg.items
 * @param {(item) => Promise<{status:'shipped'|'deferred'|'blocked', note?, output?}>} cfg.perItem
 * @param {() => Promise<{recommendation:'CONTINUE'|'CONSIDER_CLOSEOUT'|'CLOSEOUT', pctUsed:number, remainingTokens?:number}>} [cfg.gate]
 * @param {(item, result) => void} [cfg.onShipped]
 * @param {(item, result) => void} [cfg.onDeferred]
 * @param {string} [cfg.repoRoot='.']
 * @param {boolean} [cfg.confirmAtConsider=true]
 * @param {boolean} [cfg.enforceTokenBudget=true]  R-H10: if item.expectedTokens > remainingTokens, defer instead of running
 * @param {boolean} [cfg.enforceMediumGate=true]  legacy non-media gates run only when repoRoot resolves to process.cwd(); media acceptance always uses repoRoot
 * @returns {Promise<{shipped:number, deferred:number, blocked:number, stopped:boolean, lastVerdict:string}>}
 */
export async function runSprint(cfg) {
  const {
    skill,
    sessionId,
    items,
    perItem,
    gate = readContextMeterDefault,
    onShipped,
    onDeferred,
    repoRoot = '.',
    confirmAtConsider = true,
    enforceTokenBudget = true,
    enforceMediumGate = true,
    log = (m) => console.log(m),
  } = cfg;

  if (!skill || !sessionId) throw new Error('skill and sessionId required');
  const normalizedRepoRoot = path.resolve(repoRoot).toLowerCase();
  const normalizedCwd = path.resolve(process.cwd()).toLowerCase();
  const mediaProject = profileFor(repoRoot).type === 'media';
  const mediumGateEligible = enforceMediumGate && normalizedRepoRoot === normalizedCwd;
  startTrace(repoRoot, { skill, sessionId, label: `sprint-${items.length}` });

  let shipped = 0;
  let deferred = 0;
  let blocked = 0;
  let stopped = false;
  let lastVerdict = 'CONTINUE';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const stepId = `#${item.id ?? i + 1}`;
    const label = item.title || item.slug || `item-${i + 1}`;

    log(`[${stepId} · ${label}] starting (${item.axis || 'misc'} · ${item.effortHours || '?'}h)`);
    recordStep(repoRoot, sessionId, skill, { id: stepId, label, status: 'started' });

    // R-H10: per-item token budget check. If the item declares expectedTokens
    // and the gate exposes remainingTokens, defer when budget is insufficient.
    let result;
    if (enforceTokenBudget && item.expectedTokens) {
      const preGate = await gate();
      const remaining = preGate.remainingTokens;
      if (typeof remaining === 'number' && remaining < item.expectedTokens) {
        log(`  ↷ deferring · expected ${item.expectedTokens} tok > remaining ${remaining}`);
        result = { status: 'deferred', note: `budget: need ${item.expectedTokens}, have ${remaining}` };
      }
    }

    if (!result) {
      try {
        result = await perItem(item);
      } catch (e) {
        result = { status: 'blocked', note: e.message || String(e) };
      }
    }

    let status = result?.status || 'shipped';

    // S126 audit #32: medium quality-gate enforcement on shipped items
    if (status === 'shipped' && mediaProject) {
      // Media acceptance is tied to the actual target, including owner-driven runs
      // launched from Studio Ops. Missing evidence cannot become a shipped item.
      const gateResult = runMediaGate(item, { projectDir: repoRoot });
      result = { ...result, mediaAcceptance: gateResult };
      if (!gateResult.pass) {
        status = 'blocked';
        result = { ...result, status, note: 'media-gate: ' + gateResult.reason, fixHint: gateResult.fixHint };
        log('  media-gate ' + gateResult.state + ': ' + gateResult.reason);
      }
    } else if (status === 'shipped' && mediumGateEligible) {
      try {
        const [profileMod, gateMod] = await Promise.all([
          import('./project-profile.mjs').catch(() => null),
          import('./medium-quality-gates.mjs').catch(() => null),
        ]);
        if (profileMod && gateMod) {
          const profile = profileMod.getProjectProfile();
          const gateResult = gateMod.runMediumGate(profile.medium, item);
          if (!gateResult.pass) {
            log(`  ⚠ medium-gate FAIL (${profile.medium}): ${gateResult.reason}`);
            if (gateResult.fixHint) log(`    fix: ${gateResult.fixHint}`);
            status = 'blocked';
            result = { ...result, status: 'blocked', note: `medium-gate: ${gateResult.reason}`, fixHint: gateResult.fixHint };
          } else {
            log(`  ✓ medium-gate (${profile.medium}) pass`);
          }
        }
      } catch { /* gate is advisory if it errors */ }
    }

    recordStep(repoRoot, sessionId, skill, { id: stepId, label, status: status === 'shipped' ? 'completed' : status, output: result?.note });

    if (status === 'shipped') { shipped++; onShipped?.(item, result); }
    else if (status === 'deferred') { deferred++; onDeferred?.(item, result); }
    else if (status === 'blocked') { blocked++; }

    // Gate
    const verdict = await gate();
    lastVerdict = verdict.recommendation || 'CONTINUE';
    if (lastVerdict === 'CLOSEOUT') {
      log(`⛔ context-meter CLOSEOUT (${verdict.pctUsed}%) — stopping sprint`);
      stopped = true;
      break;
    }
    if (lastVerdict === 'CONSIDER_CLOSEOUT' && confirmAtConsider) {
      log(`⚠ context-meter CONSIDER_CLOSEOUT (${verdict.pctUsed}%) — continuing unless founder redirects`);
    }
  }

  const summary = { shipped, deferred, blocked, stopped, lastVerdict, totalItems: items.length };
  finishTrace(repoRoot, sessionId, skill, { status: stopped ? 'deferred' : 'completed', summary });
  log(`Sprint complete — shipped=${shipped} deferred=${deferred} blocked=${blocked}${stopped ? ' (stopped)' : ''}`);
  return summary;
}

export default { runSprint };
