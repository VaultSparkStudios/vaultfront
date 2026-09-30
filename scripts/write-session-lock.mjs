#!/usr/bin/env node
/**
 * write-session-lock.mjs
 *
 * Writes context/.session-lock reliably using Node fs.
 * bash `echo > file` silently fails for dotfiles on Windows — this doesn't.
 *
 * Usage:
 *   node scripts/write-session-lock.mjs [--agent <claude-code|codex|other>] [--trigger <founder-mission|recovery|scheduled-routine|ad-hoc>] [--note "..."]
 *   node scripts/ops.mjs write-session-lock --agent claude-code
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Self-healing default label, derived from the model-router chokepoint (the single
// source of truth for model IDs) when it's reachable: a chokepoint bump (opus 4.7
// -> 4.8) carries into the lock label automatically — no stale hardcode (S165).
// write-session-lock is deliberately copyable + invoked standalone (concurrency
// tests, bootstrap), so the chokepoint may be absent; fall back to the current
// canonical label rather than hard-failing the import. Strips the 'claude-' API
// prefix to keep a human label (not an API ID) and appends the 1M-context suffix.
let DEFAULT_CLAUDE_LABEL = 'opus-4-8-1m';
let DEFAULT_CODEX_LABEL = 'codex-272k';
let DEFAULT_CODEX_CONTEXT_LIMIT = 272_000;
try {
  const { MODELS, CONTEXT_WINDOWS } = await import('./lib/model-router.mjs');
  if (MODELS?.opus) DEFAULT_CLAUDE_LABEL = MODELS.opus.replace(/^claude-/, '') + '-1m';
  if (CONTEXT_WINDOWS?.['codex-272k']) DEFAULT_CODEX_CONTEXT_LIMIT = CONTEXT_WINDOWS['codex-272k'];
} catch { /* standalone copy — chokepoint unavailable, keep fallback */ }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

// This script is copied standalone by concurrency/bootstrap tests. Use the
// shared resolver when its propagated dependency is present, and preserve the
// old copyable behavior when it is not.
let resolveSessionIdentity = () => null;
try {
  ({ resolveActiveSessionId: resolveSessionIdentity } = await import('./lib/session-identity.mjs'));
} catch { /* standalone copy — session identity remains unavailable */ }

// S328 audit #2 — the session-number allocator must not reissue a number already SPENT
// in git history. session-identity.mjs stays spawn-free so it can keep travelling with
// the standalone copies of this script, so the git read lives HERE, behind the same
// guarded lazy import: where safe-spawn is absent (a copied fixture) this yields null and
// the allocator degrades to the closed-surface answer, exactly as before.
let gitLogText = null;
try {
  const { spawnSync } = await import('./lib/safe-spawn.mjs');
  const log = spawnSync('git', ['log', '-n400', '--format=%s'], {
    cwd: ROOT, encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
  if (log.status === 0 && typeof log.stdout === 'string') gitLogText = log.stdout;
} catch { /* no git, or standalone copy without safe-spawn — degrade, never crash */ }

// S291 — `--help` must never fire the action (S281). This writer had no help
// branch at all, so `node scripts/write-session-lock.mjs --help` WROTE THE LOCK
// and printed a success line, which is how it was found: asking a state-mutating
// CLI what its flags were mutated the state. Found live this session.
if (args.includes('--help') || args.includes('-h')) {
  console.log(`write-session-lock — write context/.session-lock for this session.

  --agent <id>     agent identity (default: detected)
  --trigger <t>    bounded trigger (default: ad-hoc)
  --model <id>     model identity
  --note <text>    freeform note
  --session <n>    declare the session number (recorded as session_source: declared;
                   refused at or below the newest CLOSED session)
  session_id       otherwise derived from closed SIL/status + numbers spent in git
  --help           this text (writes nothing)

Writes nothing when invoked with --help.`);
  process.exit(0);
}

function valueArg(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`⛔ ${name} requires a value`);
    process.exit(2);
  }
  return value;
}

function normalizeTrigger(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (/^(cron|timer|schedule|scheduled|routine|scheduled-routine)$/.test(raw)) return 'scheduled-routine';
  if (/^(founder|founder-mission|goal)$/.test(raw)) return 'founder-mission';
  if (/^(manual|ad-hoc|adhoc)$/.test(raw)) return 'ad-hoc';
  if (raw === 'recovery') return raw;
  return null;
}

const agentArg = args.find((_, i) => args[i - 1] === '--agent') ?? 'claude-code';
const noteArg = args.find((_, i) => args[i - 1] === '--note') ?? 'Session start via /start protocol v1.3';
const triggerInput = valueArg('--trigger') ?? process.env.STUDIO_SESSION_TRIGGER ?? 'ad-hoc';
const triggerArg = normalizeTrigger(triggerInput);
if (!triggerArg) {
  console.error(`⛔ invalid session trigger "${triggerInput}" (expected founder-mission, recovery, scheduled-routine, or ad-hoc)`);
  process.exit(2);
}
// Model can be pinned for accurate context-meter calibration. Precedence:
//   --model <id>  >  $CLAUDE_MODEL_ID  >  $CLAUDE_MODEL  >  auto (by agent)
const modelArg = args.find((_, i) => args[i - 1] === '--model')
  ?? process.env.CLAUDE_MODEL_ID
  ?? process.env.CLAUDE_MODEL
  // Lock stores a human-readable label, NOT an API model ID (keeps chokepoint
  // tier1 test happy: no "claude-*-N" hardcoded outside lib/model-router.mjs).
  ?? (agentArg === 'claude-code' ? DEFAULT_CLAUDE_LABEL
      : agentArg === 'codex' ? DEFAULT_CODEX_LABEL
      : 'unknown');
// Context window in tokens. Precedence:
//   --context-limit <n>  >  provider-specific env override  >  inferred model
function inferCtxLimit(modelId) {
  // Codex runtime metadata is provider-specific, independent of an API model name.
  // Explicit --context-limit and CODEX_CONTEXT_LIMIT still take precedence.
  if (agentArg === 'codex') return DEFAULT_CODEX_CONTEXT_LIMIT;
  if (/1m/i.test(modelId)) return 1_000_000;
  if (/272k/i.test(modelId)) return DEFAULT_CODEX_CONTEXT_LIMIT;
  if (/opus|sonnet/i.test(modelId)) return 200_000;
  return 200_000;
}
const ctxLimitArg = args.find((_, i) => args[i - 1] === '--context-limit');
const providerContextOverride = agentArg === 'codex'
  ? process.env.CODEX_CONTEXT_LIMIT
  : process.env.CLAUDE_CONTEXT_LIMIT;
const ctxLimit = ctxLimitArg
  ? parseInt(ctxLimitArg, 10)
  : (providerContextOverride ? parseInt(providerContextOverride, 10) : inferCtxLimit(modelArg));

const projectName = path.basename(ROOT);
const lockPath = path.join(ROOT, 'context', '.session-lock');
const now = new Date().toISOString();
// Preserve existing session_start so repeated /start invocations within the
// same Studio Ops session don't orphan ledger entries (the meter filters
// ledger entries by ts >= session_start). Use --force to rotate.
const FORCE = args.includes('--force');
let sessionStart = now;
if (!FORCE && fs.existsSync(lockPath)) {
  const prior = fs.readFileSync(lockPath, 'utf8');
  const m = prior.match(/^session_start:\s*(\S+)/m);
  if (m) {
    const priorTs = new Date(m[1]).getTime();
    // Only carry over if the prior lock is <12h old — otherwise treat as stale.
    if (Date.now() - priorTs < 12 * 3600 * 1000) sessionStart = m[1];
  }
}
// S341 [audit #2] — A DECLARED SESSION OUTRANKS INFERENCE, BUT NEVER REWINDS THE LEDGER.
//
// The allocator treats every S<n> already in git as spent, which is right — and it has
// no way to know a commit belongs to the session being opened. /start's residue STOP
// happens BEFORE this lock is written, so a residue commit scoped `chore(S341)` spent
// 341 and this writer locked the S341 session as 342, while the brief and SIL both said
// 341. The only correction path was hand-editing the lock: an identity change with no
// record. `--session <n>` is the recorded path (the S338 autopilot precedent), and it is
// bounded from below: a number at or under the newest CLOSED session is refused, because
// reusing a closed number is the corruption the allocator exists to prevent.
let sessionId;
let sessionSource = 'derived';
if (args.includes('--session')) {
  const declared = Number(valueArg('--session'));
  if (!Number.isInteger(declared) || declared <= 0) {
    console.error('⛔ --session requires a positive integer');
    process.exit(2);
  }
  let closedMax = null;
  const identity = await import('./lib/session-identity.mjs').catch(() => null);
  if (identity) {
    let status = {};
    let sil = '';
    try { status = JSON.parse(fs.readFileSync(path.join(ROOT, 'context', 'PROJECT_STATUS.json'), 'utf8')); } catch {}
    try { sil = fs.readFileSync(path.join(ROOT, 'context', 'SELF_IMPROVEMENT_LOOP.md'), 'utf8'); } catch {}
    const closed = [identity.closedSessionFromStatus(status), identity.closedSessionFromSil(sil)].filter(Number.isFinite);
    closedMax = closed.length ? Math.max(...closed) : null;
  }
  if (Number.isFinite(closedMax) && declared <= closedMax) {
    console.error(`⛔ --session ${declared} refused: S${closedMax} is already CLOSED — a closed number is never reissued`);
    process.exit(2);
  }
  sessionId = declared;
  sessionSource = 'declared';
} else {
  sessionId = resolveSessionIdentity(ROOT, {
    lockText: fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : '',
    gitLogText,
  });
}

const content = [
  `locked_by: agent-session`,
  `session_start: ${sessionStart}`,
  ...(Number.isFinite(sessionId) ? [`session_id: ${sessionId}`, `session_source: ${sessionSource}`] : []),
  `agent: ${agentArg}`,
  `trigger: ${triggerArg}`,
  `model: ${modelArg}`,
  `context_limit: ${ctxLimit}`,
  `project: ${projectName}`,
  `note: ${noteArg}`,
  '',
].join('\n');

fs.writeFileSync(lockPath, content, 'utf8');
console.log(`✓ context/.session-lock written (agent: ${agentArg}, project: ${projectName})`);
// Calendar auto-event at /start removed S107.10 — noise without signal.
// Founder already knows they just typed /start; the calendar event restated
// that without providing any planning signal. Script stays available for
// on-demand use: `node scripts/ops.mjs calendar-session-event`.
