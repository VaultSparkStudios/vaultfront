/**
 * secrets.mjs — Studio Ops secrets gateway (v3.1)
 *
 * Single API for agents to read secrets from `secrets/*.env` plus a narrowly
 * allowlisted set of legacy single-value files normalized into canonical keys.
 * Every access is audited to `secrets/.access.log` (gitignored).
 * Raw values are scrubbable from any downstream log via `redact()`.
 *
 * Agents MUST use this module rather than reading `secrets/*.env` directly.
 * AGENTS.md v3.1 rule: before labeling any item "Human Action Required",
 * call `resolveCapability(capability)` — if all required keys are present,
 * proceed autonomously.
 *
 * Usage:
 *   import { getSecret, resolveCapability, redact } from './lib/secrets.mjs';
 *
 *   const apiKey = getSecret('ANTHROPIC_API_KEY', 'claude.api');
 *   const { ok, missing } = resolveCapability('stripe.checkout');
 *   console.log(redact(`Key is ${apiKey}`));  // "Key is ****"
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
export function resolveSecretsRoot(repoRoot = REPO_ROOT, env = process.env) {
  return path.resolve(env.VAULTSPARK_SECRETS_DIR_OVERRIDE || path.join(repoRoot, 'secrets'));
}
// Tests can redirect lookups with VAULTSPARK_SECRETS_DIR_OVERRIDE (see
// scripts/test/lib/credential-mocks.mjs). Production code never sets this.
const SECRETS_DIR = resolveSecretsRoot();
// Sibling Studio Ops secrets dir — per AGENTS.md, all Studio credentials live here.
// Walk parents (up to 6 levels) so this script works whether it's running in
// studio-ops itself, a sibling project repo, or a worktree.
// Local `<repo>/secrets/` still wins when both define the same key (project override).
function findStudioOpsSecretsDir() {
  if (process.env.STUDIO_OPS_SECRETS_DIR) return process.env.STUDIO_OPS_SECRETS_DIR;
  let dir = REPO_ROOT;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'vaultspark-studio-ops', 'secrets');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
const STUDIO_OPS_SECRETS_DIR = findStudioOpsSecretsDir();
const CAP_MAP_PATH = path.join(SECRETS_DIR, 'CAPABILITY_MAP.json');
const ACCESS_LOG = path.join(SECRETS_DIR, '.access.log');

let _cache = null;         // flat merged env
let _cacheStamp = 0;
let _capMap = null;
let _redactList = new Set();

// CANON-012/019/040: legacy single-value credentials are normalized HERE, never
// read by project call sites. Keep this list explicit: arbitrary *.txt loading
// would turn every note/file in secrets/ into ambient credential state.
export const LEGACY_SINGLE_VALUE_SOURCES = Object.freeze({
  'supabase-pat.txt': 'SUPABASE_ACCESS_TOKEN',
});

/**
 * Load and merge every `secrets/*.env` file into a flat key→value map.
 * Cached for 60s to avoid repeated disk reads across a single session.
 */
function loadEnv() {
  const now = Date.now();
  if (_cache && (now - _cacheStamp) < 60_000) return _cache;

  const merged = {};

  // Read in low → high precedence so later dirs override.
  // Studio Ops sibling secrets dir → local repo secrets dir.
  // De-dupe so studio-ops doesn't read itself twice when run from its own repo.
  const dirSet = new Set();
  for (const d of [STUDIO_OPS_SECRETS_DIR, SECRETS_DIR]) {
    if (d && fs.existsSync(d)) dirSet.add(path.resolve(d));
  }
  if (dirSet.size === 0) {
    _cache = merged; _cacheStamp = now;
    return merged;
  }

  for (const dir of dirSet) {
    // Low precedence inside a directory: a canonical .env value wins over its
    // legacy adapter. The allowlisted raw file remains untouched on disk.
    for (const [file, key] of Object.entries(LEGACY_SINGLE_VALUE_SOURCES)) {
      const source = path.join(dir, file);
      if (!fs.existsSync(source)) continue;
      const value = fs.readFileSync(source, 'utf8').trim();
      if (!value || /[\r\n]/.test(value) || value === 'REPLACE_ME' || value.startsWith('REPLACE_ME')) continue;
      merged[key] = value;
      if (value.length >= 8) _redactList.add(value);
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.env') && !f.startsWith('.'));
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (val && val !== 'REPLACE_ME' && !val.startsWith('REPLACE_ME')) {
          merged[key] = val;
          if (val.length >= 8) _redactList.add(val);
        }
      }
    }
  }

  _cache = merged; _cacheStamp = now;
  return merged;
}

function loadCapMap() {
  if (_capMap) return _capMap;
  // S180 [audit #2] — distinguish ABSENT (legit: CI without secrets/, silent) from
  // CORRUPT (the file exists but won't parse — e.g. smart-quote/encoding damage).
  // The old blanket `catch { empty }` made a corrupted CAPABILITY_MAP.json degrade
  // every capability resolution SILENTLY (a CANON-031 observability violation): a
  // single curly quote could make getSecret/resolveCapability fail to find any
  // capability with no signal. Corruption now fails LOUD (stderr + access log)
  // while still returning empty so callers degrade gracefully rather than crash.
  if (!fs.existsSync(CAP_MAP_PATH)) { _capMap = { capabilities: {}, _absent: true }; return _capMap; }
  try {
    _capMap = JSON.parse(fs.readFileSync(CAP_MAP_PATH, 'utf8'));
  } catch (e) {
    const msg = `CAPABILITY_MAP.json is present but UNPARSEABLE (${e.message}). ` +
      `Capability resolution is degraded to empty — fix the file. ` +
      `Common cause: smart quotes (U+201C/U+201D) or encoding mojibake from a paste.`;
    try { process.stderr.write(`⚠ secrets: ${msg}\n`); } catch { /* stream closed */ }
    try { audit({ event: 'capability-map-corrupt', error: e.message }); } catch { /* never break callers */ }
    _capMap = { capabilities: {}, _corrupt: true, _corruptError: e.message };
  }
  return _capMap;
}

function audit(entry) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      agent: process.env.CLAUDE_AGENT_ID || process.env.USER || 'unknown',
      ...entry,
    });
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
    fs.appendFileSync(ACCESS_LOG, line + '\n');
  } catch { /* auditing never breaks callers */ }
}

/**
 * Return the value of a secret key, or `null` if missing.
 * Resolution order: process.env → secrets/*.env → Anthropic Credential Vault (if configured).
 * `capability` is a free-form string for auditing (e.g. "claude.api").
 */
export function getSecret(key, capability = 'unspecified') {
  // Deterministic test seam (S210). When STUDIO_OPS_TEST_NO_SECRETS is explicitly set,
  // the gateway behaves as if NO credential is vaulted — so credential-gated branches
  // (fallback / early-bail / offline paths) can be exercised the SAME way on a
  // credentialed founder host and in credential-less CI. Without this, tests that
  // `delete process.env.X` to force a fallback are silently host-dependent, because
  // getSecret reads from secrets/*.env, not process.env (see
  // tier1-gateway-credential-test-honesty). Production never sets this flag.
  if (/^(1|true|yes|on)$/i.test(process.env.STUDIO_OPS_TEST_NO_SECRETS || '')) {
    audit({ key, capability, result: 'TEST_NO_SECRETS' });
    return null;
  }
  const env = loadEnv();
  const val = env[key] ?? process.env[key] ?? null;
  audit({ key, capability, result: val ? 'FOUND' : 'MISSING' });
  return val;
}

/**
 * Resolve a secret, falling back to the Anthropic Credential Vault if not found locally.
 * Vault is only consulted for MCP-related capabilities (sentry.mcp, google.calendar, etc.)
 * when ANTHROPIC_VAULT_ID is set in secrets/anthropic.env.
 * Returns { value, source: 'env'|'vault'|null }.
 */
export async function getSecretWithVaultFallback(key, capability = 'unspecified') {
  const local = getSecret(key, capability);
  if (local) return { value: local, source: 'env' };

  // Only attempt vault lookup for MCP capabilities
  const map = loadCapMap();
  const capDef = map.capabilities?.[capability] ?? {};
  if (!capDef.vault) return { value: null, source: null };

  const vaultId = loadEnv()['ANTHROPIC_VAULT_ID'] ?? process.env.ANTHROPIC_VAULT_ID;
  const apiKey = loadEnv()['ANTHROPIC_API_KEY'] ?? process.env.ANTHROPIC_API_KEY;
  if (!vaultId || !apiKey) return { value: null, source: null };

  try {
    // Lazy import to avoid loading vault-client when not needed
    const { VaultClient } = await import('./vault-client.mjs');
    const vault = new VaultClient(apiKey);
    const creds = await vault.listCredentials(vaultId);
    const match = creds.find(c => c.display_name === key || c.display_name === capability);
    if (match) {
      audit({ key, capability, result: 'VAULT_HIT', credentialId: match.id });
      return { value: match.id, source: 'vault' };
    }
  } catch { /* vault unavailable — not an error */ }

  return { value: null, source: null };
}

/**
 * Every distinct outcome capability resolution can have. S313 [audit #1]: the prior
 * `ok = required.length > 0 && missing.length === 0` collapsed four different worlds
 * into one indistinguishable `{ok:false, missing:[]}` — a credential-free capability,
 * an unknown capability name, an absent map and a corrupt map all returned the same
 * bytes. `missing` was then rendered by 25 call sites as if it named a credential,
 * so the founder-facing line read `⛔ MISSING  missing:` with nothing after the colon
 * and the pg-backup healer wrote that same empty cause into its durable receipt.
 *
 * The set is six, not the five the audit recipe named. `map-absent` is deliberately
 * NOT folded into `map-unreadable`: an absent map is the designed, legitimate CI case
 * (loadCapMap has always treated it as silent-and-empty) while an unparseable map is a
 * loud defect. Folding them would reproduce exactly the collapse this fixes.
 */
export const CAPABILITY_REASONS = Object.freeze([
  'ready',                   // every declared env var is present
  'no-credentials-required', // declared with an empty env list (OAuth/MCP-brokered) — nothing to hold
  'missing-credentials',     // declared env vars, one or more absent — `missing` names them
  // S332 — set, but pointing at nothing. A *_PATH/_FILE/_KEYFILE variable whose target
  // does not exist on this host: every presence test passes and the capability is
  // unusable. Its own state because its remedy is its own — "you never set this" sends
  // the reader to the provider, "the file is not on this machine" sends them to the box.
  'path-unresolved',
  'unknown-capability',      // not in CAPABILITY_MAP.json at all (typically a typo)
  'map-absent',              // no CAPABILITY_MAP.json on this host (legitimate: CI without secrets/)
  'map-unreadable',          // the map exists and will not parse
]);

/** Reasons under which the capability is usable. A credential-free capability IS ready. */
const READY_REASONS = new Set(['ready', 'no-credentials-required']);

/**
 * Check whether a capability is usable, and say WHY in one word.
 * @param {string} capability - e.g. "stripe.checkout"
 * @returns {{ok: boolean, reason: string, required: string[], missing: string[], found: string[]}}
 */
/**
 * S332 — the three states one required key can be in.
 *
 * Extracted as a pure function because it is the part worth testing and the part that was
 * wrong: the loader's own precedence (secrets/*.env beats process.env) makes the resolver
 * awkward to drive from a test, and a rule this small should not be provable only through
 * a live capability on one machine.
 *
 * `PATH`/`FILE`/`KEYFILE` suffixes are the declaration of intent — the rule keys on the
 * variable's NAME, never on whether a value happens to look like a path, so a token that
 * resembles one is never filesystem-tested.
 */
export function classifyRequiredKey(key, value, exists = fs.existsSync) {
  if (!value) return 'missing';
  if (!/_(PATH|FILE|KEYFILE)$/.test(key)) return 'present';
  // NOT every path is a LOCAL path. `RESTIC_REMOTE_PATH` names a location on a backup
  // server; filesystem-testing it here would report a perfectly good credential as
  // unresolved, and a wrong rejection is the expensive direction — it is what teaches
  // an operator to stop believing the gateway. Two independent tells, because a remote
  // location can arrive under any name: the name says REMOTE, or the value carries a
  // scheme or a `user@host:` prefix. Found in review, before it could fire: the map
  // declares exactly one such variable and it happens to be unset today.
  if (/REMOTE/.test(key)) return 'present';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^[^/\\\s]+@[^/\\\s]+:/.test(value)) return 'present';
  // S333 [audit #9] — A TILDE IS A PATH THIS HOST CAN RESOLVE, and `fs` is the one
  // reader that will not resolve it. S332 shipped this check and taught it that a
  // REMOTE path is not a local one; one commit later the same rule reported
  // `hetzner.ssh` as "set but UNUSABLE on this host — HETZNER_SSH_KEY_PATH points at a
  // path that does not exist" for the value `~/.ssh/id_ed25519`, a file that plainly
  // exists. OpenSSH expands `~` itself, so the credential was always good: the
  // deployers that consume it connected over SSH and returned real remote checksums
  // WHILE the gateway called them blocked. That is a phantom blocker the gateway
  // manufactured about itself (CANON-019), and a wrong rejection is the expensive
  // direction — it is exactly what teaches an operator to stop believing the gateway.
  return exists(expandHome(value)) ? 'present' : 'path-unresolved';
}

/**
 * Expand a leading `~` the way every shell and OpenSSH already does. Only a bare `~` or
 * a `~/`-prefixed value is expanded — `~user/...` is deliberately left alone, because
 * resolving another account's home is a guess, and a guess must never point forward.
 */
export function expandHome(value, home = os.homedir()) {
  const v = String(value);
  if (v === '~') return home;
  if (v.startsWith('~/') || v.startsWith('~\\')) return path.join(home, v.slice(2));
  return v;
}

export function resolveCapability(capability) {
  const map = loadCapMap();
  const entry = map.capabilities?.[capability];
  const required = entry?.env || [];
  const env = loadEnv();
  const missing = [];
  const found = [];
  // S332 — A *_PATH VARIABLE POINTS AT SOMETHING. PRESENCE OF THE POINTER IS NOT
  // PRESENCE OF THE THING.
  //
  // Found by trying to use a capability instead of reading its badge: `hetzner.ssh`
  // reported READY 2/2 while the private key at `HETZNER_SSH_KEY_PATH` did not exist on
  // this machine. Both variables were set, so every presence test passed, and the
  // capability was unusable — the same shape as S319's resolvable-vs-missing collapse
  // and S313's state that cannot express what it is in. A path credential that resolves
  // to nothing is MISSING wearing a READY badge, and an agent reading the badge will
  // plan work it cannot do (this session did exactly that, twice, in a handoff).
  //
  // Reported as its own reason, not folded into `missing-credentials`: "you never set
  // this" and "you set it and the file is gone" need different actions from the reader.
  const unresolvedPaths = [];
  for (const k of required) {
    const state = classifyRequiredKey(k, env[k] || process.env[k]);
    if (state === 'missing') missing.push(k);
    else if (state === 'path-unresolved') unresolvedPaths.push(k);
    else found.push(k);
  }

  let reason;
  if (map._corrupt) reason = 'map-unreadable';
  else if (map._absent) reason = 'map-absent';
  else if (!entry) reason = 'unknown-capability';
  else if (required.length === 0) reason = 'no-credentials-required';
  else if (missing.length === 0 && unresolvedPaths.length === 0) reason = 'ready';
  else if (missing.length === 0) reason = 'path-unresolved';
  else reason = 'missing-credentials';

  const ok = READY_REASONS.has(reason);
  audit({ capability, action: 'resolveCapability', ok, reason, missing });
  return { ok, reason, required, missing, found, unresolvedPaths };
}

/**
 * The ONE renderer for a resolveCapability result. Call sites must not format
 * `.missing` themselves — an empty array is a legitimate outcome for four of the six
 * reasons, and `missing.join(', ')` turns every one of them into the empty string.
 * Guaranteed non-empty for every reason.
 * @param {{ok:boolean, reason:string, required:string[], missing:string[], found:string[]}} result
 * @param {{capability?: string}} [opts]
 */
export function describeCapability(result, opts = {}) {
  const cap = opts.capability ? `${opts.capability}: ` : '';
  const { reason, required = [], missing = [], found = [], unresolvedPaths = [] } = result || {};
  switch (reason) {
    case 'ready':
      return `${cap}${found.length}/${required.length} all present`;
    case 'no-credentials-required':
      return `${cap}no credentials required (brokered/OAuth capability)`;
    case 'missing-credentials':
      return missing.length > 3
        ? `${cap}missing ${missing.length}: ${missing.slice(0, 2).join(', ')}…`
        : `${cap}missing: ${missing.join(', ')}`;
    // S332 — its own sentence, because its remedy is its own too. "You never set this"
    // sends the reader to the provider; "you set it and the file is not on this machine"
    // sends them to the machine. Folding the second into the first cost this session two
    // phantom founder actions in a handoff.
    case 'path-unresolved':
      return `${cap}set but UNUSABLE on this host — ${unresolvedPaths.join(', ')} points at a path that does not exist`;
    case 'unknown-capability':
      return `${cap}unknown capability — not declared in secrets/CAPABILITY_MAP.json (check the spelling)`;
    case 'map-absent':
      return `${cap}no CAPABILITY_MAP.json on this host — capability resolution unavailable here`;
    case 'map-unreadable':
      return `${cap}CAPABILITY_MAP.json will not parse — capability resolution degraded`;
    default:
      return `${cap}unrecognised resolution reason ${JSON.stringify(reason)}`;
  }
}

/**
 * List all known capabilities and their readiness.
 */
export function listCapabilities() {
  const map = loadCapMap();
  const caps = Object.keys(map.capabilities || {});
  return caps.map(c => ({ capability: c, ...resolveCapability(c) }));
}

/**
 * Redact all known secret values from a string before logging.
 * Call on any text that might contain secrets before emitting to stdout/stderr/file.
 */
export function redact(text) {
  if (!text || typeof text !== 'string') return text;
  loadEnv(); // populate _redactList
  let out = text;
  for (const val of _redactList) {
    if (val && val.length >= 8) {
      out = out.split(val).join('****');
    }
  }
  return out;
}

/**
 * Returns a child of `process.env` augmented with secrets — for passing to
 * `spawnSync({ env: ... })` without polluting the parent process env.
 */
export function envForSpawn(capability = 'spawn', extraKeys = []) {
  const env = loadEnv();
  const out = { ...process.env };
  // Merge all capability keys if cap map known, or caller-provided extras
  const map = loadCapMap();
  const req = [
    ...(map.capabilities?.[capability]?.env || []),
    ...extraKeys,
  ];
  for (const k of req) {
    if (env[k]) out[k] = env[k];
  }
  audit({ capability, action: 'envForSpawn', keys: req });
  return out;
}
