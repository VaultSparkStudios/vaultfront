// Agent identity resolution (S271) — the missing dimension in cross-repo provenance.
//
// WHY THIS EXISTS
// Both durable provenance planes record WHICH REPO acted, never WHICH AGENT:
//   · Ark cargo   `{ from, to }`  are repo slugs. No agent field at all.
//   · Obelisk receipts `actor`    was 'studio-ops' on 4,164 of 4,176 receipts.
// So "what did Codex touch vs Claude Code" was unanswerable from either ledger,
// even though `context/.session-lock` has carried `agent:` the whole time. The
// identity existed at the source and was dropped before the write.
//
// THE HONESTY RULE (CANON-031)
// This module NEVER guesses. If the agent cannot be established from a real
// signal it returns `agent: null` with `source: 'unresolved'`. A fabricated
// 'claude-code' default would poison the exact attribution the ledgers exist to
// provide — and would be indistinguishable from a real reading. Consumers must
// render unresolved as UNATTRIBUTED, never as a name and never as a zero.
//
// Resolution order (first real signal wins):
//   1. explicit argument      — caller knows (e.g. a broker executing for a lane)
//   2. $STUDIO_AGENT          — set by non-Claude harnesses / CI lanes
//   3. context/.session-lock  — written by scripts/write-session-lock.mjs
//   4. unresolved             — null, honestly
import fs from 'node:fs';
import path from 'node:path';

// Agents we mint identities for. An unrecognized value is still RECORDED (we do
// not silently drop a real signal) but is flagged so a typo'd lane is visible
// rather than quietly becoming its own permanent identity in the ledger.
export const KNOWN_AGENTS = ['claude-code', 'codex', 'managed-agent', 'cron', 'broker'];

/** Parse the `key: value` session lock. Returns {} when absent/unreadable. */
export function parseSessionLock(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

export function readSessionLock(repoRoot) {
  try {
    const p = path.join(repoRoot, 'context', '.session-lock');
    if (!fs.existsSync(p)) return null;
    return parseSessionLock(fs.readFileSync(p, 'utf8'));
  } catch { return null; }
}

/**
 * Resolve the acting agent.
 * @returns {{agent: string|null, source: string, known: boolean, model: string|null}}
 */
export function resolveAgentIdentity({ repoRoot = process.cwd(), explicit, env = process.env } = {}) {
  const finish = (agent, source, model = null) => ({
    agent: agent || null,
    source: agent ? source : 'unresolved',
    known: agent ? KNOWN_AGENTS.includes(agent) : false,
    model: model || null,
  });

  if (explicit) return finish(String(explicit).trim(), 'explicit');

  const fromEnv = (env.STUDIO_AGENT || '').trim();
  if (fromEnv) return finish(fromEnv, 'env:STUDIO_AGENT');

  const lock = readSessionLock(repoRoot);
  if (lock?.agent) return finish(lock.agent, 'session-lock', lock.model || null);

  return finish(null, 'unresolved');
}

/**
 * Compose the Obelisk `actor` string.
 *
 * The receipt ledger already uses an `actor:subject` namespace convention
 * ('studio-ops:deploy-shared-server-maintenance'). We KEEP `actor` exactly as it
 * was — 4,176 existing receipts and every downstream parser depend on it — and
 * carry the agent in its own field instead. Widening `actor` would have silently
 * changed the meaning of historical rows.
 */
export function receiptIdentity({ actor = 'studio-ops', repoRoot, explicit, env } = {}) {
  const id = resolveAgentIdentity({ repoRoot, explicit, env });
  return {
    actor,                    // unchanged, backward-compatible
    agent: id.agent,          // null when unresolved — never fabricated
    agentSource: id.source,   // provenance OF the provenance
  };
}

/** Short human label for UI. Unresolved renders as UNATTRIBUTED, never a guess. */
export function agentLabel(agent) {
  return agent ? String(agent) : 'UNATTRIBUTED';
}

/**
 * Caller-side runtime evidence of which agent is executing, resolved WITHOUT
 * reading the session lock.
 *
 * `resolveAgentIdentity()` deliberately falls back to the lock, which is correct
 * for attribution — the lock IS the session's declared identity. But it also
 * makes the lock unfalsifiable: a consumer asking "is this lock mine?" gets back
 * the lock's own answer. This is the independent witness, the process's own
 * environment, which only the running runtime can set.
 *
 * Returns `agent: null` when no runtime signal exists (a plain shell, a CI job, a
 * spawned helper). That is "cannot corroborate", never "mismatch" — collapsing
 * the two would make every non-agent caller read as a foreign lock.
 */
export function runtimeAgentSignal(env = process.env) {
  const explicit = (env.STUDIO_AGENT || '').trim();
  if (explicit) return { agent: explicit, source: 'env:STUDIO_AGENT' };
  if (env.CLAUDECODE === '1' || env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDE_CODE_SESSION_ID) {
    return { agent: 'claude-code', source: 'env:CLAUDECODE' };
  }
  if (env.CODEX_SESSION_TRIGGER || env.CODEX_CONTEXT_LIMIT || env.CODEX_SANDBOX) {
    return { agent: 'codex', source: 'env:CODEX_*' };
  }
  return { agent: null, source: 'unavailable' };
}

/**
 * Decide whether a session lock describes the CALLING process (S342 [SIL #2]).
 *
 * S342: `context-meter` read a 52.6h-old lock left by a dead Codex session and
 * reported `203.8% used · remainingTokens 0 · CLOSEOUT` for a Claude session that
 * was actually at 33.3% · CONTINUE — a 170-point error on the one signal that
 * decides whether a session may continue at all. The meter was not wrong about
 * its subject; it was attached to the wrong subject, and never checked.
 *
 * Four states, deliberately — collapsing any pair reintroduces the defect:
 *   no-lock        nothing to verify against
 *   uncorroborated no runtime signal; PROCEED, but say the check did not run
 *   corroborated   lock agent matches the independent witness
 *   foreign-lock   they disagree; this reading belongs to another session
 *
 * `foreign-lock` must never be "repaired" by adopting the runtime agent: the
 * lock's `context_limit` and `session_start` would still belong to the other
 * session, so the number would stay wrong while looking fixed. The only correct
 * response is to refuse a verdict.
 */
export function lockSubjectVerdict({ lockAgent = null, env = process.env, signal = null } = {}) {
  const sig = signal || runtimeAgentSignal(env);
  const base = { runtimeAgent: sig.agent, runtimeSource: sig.source, lockAgent: lockAgent || null };
  if (!lockAgent) return { ...base, state: 'no-lock', trustworthy: false };
  if (!sig.agent) return { ...base, state: 'uncorroborated', trustworthy: true };
  if (sig.agent === lockAgent) return { ...base, state: 'corroborated', trustworthy: true };
  return { ...base, state: 'foreign-lock', trustworthy: false };
}
