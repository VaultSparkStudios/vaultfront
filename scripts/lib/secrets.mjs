/**
 * secrets.mjs — Studio Ops secrets gateway (v3.1)
 *
 * Single API for agents to read secrets from `secrets/*.env`.
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

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
// Tests can redirect lookups with VAULTSPARK_SECRETS_DIR_OVERRIDE (see
// scripts/test/lib/credential-mocks.mjs). Production code never sets this.
const SECRETS_DIR =
  process.env.VAULTSPARK_SECRETS_DIR_OVERRIDE ||
  path.join(REPO_ROOT, "secrets");
// Sibling Studio Ops secrets dir — per AGENTS.md, all Studio credentials live here.
// Walk parents (up to 6 levels) so this script works whether it's running in
// studio-ops itself, a sibling project repo, or a worktree.
// Local `<repo>/secrets/` still wins when both define the same key (project override).
function findStudioOpsSecretsDir() {
  if (process.env.STUDIO_OPS_SECRETS_DIR)
    return process.env.STUDIO_OPS_SECRETS_DIR;
  let dir = REPO_ROOT;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "vaultspark-studio-ops", "secrets");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
const STUDIO_OPS_SECRETS_DIR = findStudioOpsSecretsDir();
const CAP_MAP_PATH = path.join(SECRETS_DIR, "CAPABILITY_MAP.json");
const ACCESS_LOG = path.join(SECRETS_DIR, ".access.log");

let _cache = null; // flat merged env
let _cacheStamp = 0;
let _capMap = null;
let _redactList = new Set();

/**
 * Load and merge every `secrets/*.env` file into a flat key→value map.
 * Cached for 60s to avoid repeated disk reads across a single session.
 */
function loadEnv() {
  const now = Date.now();
  if (_cache && now - _cacheStamp < 60_000) return _cache;

  const merged = {};

  // Read in low → high precedence so later dirs override.
  // Studio Ops sibling secrets dir → local repo secrets dir.
  // De-dupe so studio-ops doesn't read itself twice when run from its own repo.
  const dirSet = new Set();
  for (const d of [STUDIO_OPS_SECRETS_DIR, SECRETS_DIR]) {
    if (d && fs.existsSync(d)) dirSet.add(path.resolve(d));
  }
  if (dirSet.size === 0) {
    _cache = merged;
    _cacheStamp = now;
    return merged;
  }

  for (const dir of dirSet) {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".env") && !f.startsWith("."));
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq < 1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (val && val !== "REPLACE_ME" && !val.startsWith("REPLACE_ME")) {
          merged[key] = val;
          if (val.length >= 8) _redactList.add(val);
        }
      }
    }
  }

  _cache = merged;
  _cacheStamp = now;
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
  if (!fs.existsSync(CAP_MAP_PATH)) {
    _capMap = { capabilities: {} };
    return _capMap;
  }
  try {
    _capMap = JSON.parse(fs.readFileSync(CAP_MAP_PATH, "utf8"));
  } catch (e) {
    const msg =
      `CAPABILITY_MAP.json is present but UNPARSEABLE (${e.message}). ` +
      `Capability resolution is degraded to empty — fix the file. ` +
      `Common cause: smart quotes (U+201C/U+201D) or encoding mojibake from a paste.`;
    try {
      process.stderr.write(`⚠ secrets: ${msg}\n`);
    } catch {
      /* stream closed */
    }
    try {
      audit({ event: "capability-map-corrupt", error: e.message });
    } catch {
      /* never break callers */
    }
    _capMap = { capabilities: {}, _corrupt: true, _corruptError: e.message };
  }
  return _capMap;
}

function audit(entry) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      agent: process.env.CLAUDE_AGENT_ID || process.env.USER || "unknown",
      ...entry,
    });
    fs.mkdirSync(SECRETS_DIR, { recursive: true });
    fs.appendFileSync(ACCESS_LOG, line + "\n");
  } catch {
    /* auditing never breaks callers */
  }
}

/**
 * Return the value of a secret key, or `null` if missing.
 * Resolution order: process.env → secrets/*.env → Anthropic Credential Vault (if configured).
 * `capability` is a free-form string for auditing (e.g. "claude.api").
 */
export function getSecret(key, capability = "unspecified") {
  // Deterministic test seam (S210). When STUDIO_OPS_TEST_NO_SECRETS is explicitly set,
  // the gateway behaves as if NO credential is vaulted — so credential-gated branches
  // (fallback / early-bail / offline paths) can be exercised the SAME way on a
  // credentialed founder host and in credential-less CI. Without this, tests that
  // `delete process.env.X` to force a fallback are silently host-dependent, because
  // getSecret reads from secrets/*.env, not process.env (see
  // tier1-gateway-credential-test-honesty). Production never sets this flag.
  if (/^(1|true|yes|on)$/i.test(process.env.STUDIO_OPS_TEST_NO_SECRETS || "")) {
    audit({ key, capability, result: "TEST_NO_SECRETS" });
    return null;
  }
  const env = loadEnv();
  const val = env[key] ?? process.env[key] ?? null;
  audit({ key, capability, result: val ? "FOUND" : "MISSING" });
  return val;
}

/**
 * Resolve a secret, falling back to the Anthropic Credential Vault if not found locally.
 * Vault is only consulted for MCP-related capabilities (sentry.mcp, google.calendar, etc.)
 * when ANTHROPIC_VAULT_ID is set in secrets/anthropic.env.
 * Returns { value, source: 'env'|'vault'|null }.
 */
export async function getSecretWithVaultFallback(
  key,
  capability = "unspecified",
) {
  const local = getSecret(key, capability);
  if (local) return { value: local, source: "env" };

  // Only attempt vault lookup for MCP capabilities
  const map = loadCapMap();
  const capDef = map.capabilities?.[capability] ?? {};
  if (!capDef.vault) return { value: null, source: null };

  const vaultId =
    loadEnv()["ANTHROPIC_VAULT_ID"] ?? process.env.ANTHROPIC_VAULT_ID;
  const apiKey =
    loadEnv()["ANTHROPIC_API_KEY"] ?? process.env.ANTHROPIC_API_KEY;
  if (!vaultId || !apiKey) return { value: null, source: null };

  try {
    // Lazy import to avoid loading vault-client when not needed
    const { VaultClient } = await import("./vault-client.mjs");
    const vault = new VaultClient(apiKey);
    const creds = await vault.listCredentials(vaultId);
    const match = creds.find(
      (c) => c.display_name === key || c.display_name === capability,
    );
    if (match) {
      audit({ key, capability, result: "VAULT_HIT", credentialId: match.id });
      return { value: match.id, source: "vault" };
    }
  } catch {
    /* vault unavailable — not an error */
  }

  return { value: null, source: null };
}

/**
 * Check whether all env vars required for a capability are present.
 * @param {string} capability - e.g. "stripe.checkout"
 * @returns {{ok: boolean, required: string[], missing: string[], found: string[]}}
 */
export function resolveCapability(capability) {
  const map = loadCapMap();
  const required = map.capabilities?.[capability]?.env || [];
  const env = loadEnv();
  const missing = [];
  const found = [];
  for (const k of required) {
    if (env[k] || process.env[k]) found.push(k);
    else missing.push(k);
  }
  const ok = required.length > 0 && missing.length === 0;
  audit({ capability, action: "resolveCapability", ok, missing });
  return { ok, required, missing, found };
}

/**
 * List all known capabilities and their readiness.
 */
export function listCapabilities() {
  const map = loadCapMap();
  const caps = Object.keys(map.capabilities || {});
  return caps.map((c) => ({ capability: c, ...resolveCapability(c) }));
}

/**
 * Redact all known secret values from a string before logging.
 * Call on any text that might contain secrets before emitting to stdout/stderr/file.
 */
export function redact(text) {
  if (!text || typeof text !== "string") return text;
  loadEnv(); // populate _redactList
  let out = text;
  for (const val of _redactList) {
    if (val && val.length >= 8) {
      out = out.split(val).join("****");
    }
  }
  return out;
}

/**
 * Returns a child of `process.env` augmented with secrets — for passing to
 * `spawnSync({ env: ... })` without polluting the parent process env.
 */
export function envForSpawn(capability = "spawn", extraKeys = []) {
  const env = loadEnv();
  const out = { ...process.env };
  // Merge all capability keys if cap map known, or caller-provided extras
  const map = loadCapMap();
  const req = [...(map.capabilities?.[capability]?.env || []), ...extraKeys];
  for (const k of req) {
    if (env[k]) out[k] = env[k];
  }
  audit({ capability, action: "envForSpawn", keys: req });
  return out;
}
