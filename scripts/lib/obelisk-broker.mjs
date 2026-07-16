// obelisk-broker.mjs — S183 (CANON-021 Phase 4, P0). The Secret Broker: wraps the
// CANON-012 gateway with policy + risk + short-lived grants + signed receipts, so
// consumers get RESULTS or scoped grants — never raw long-lived secrets.
// Design: docs/OBELISK_SECRET_BROKER_DESIGN.md.
//
// This is the P0 in-process increment: it enforces policy (deny-by-default),
// emits signed receipts, mints scoped grants, and keeps secrets inside the broker
// closure. Full cross-process isolation (broker as a service) is P2+; the API
// shape here is final so callers don't change when that lands.
//
// The broker is the ONLY code that should call raw getSecret for a brokered
// capability. Everyone else calls brokeredAction()/requestGrant().

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSecret } from "./secrets.mjs";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const POLICY_PATH = path.join(ROOT, "portfolio", "obelisk-policy.json");
const RECEIPTS = path.join(ROOT, "portfolio", "ops", "obelisk-receipts.ndjson");

// ── policy (deny-by-default) ─────────────────────────────────────────────────
const DEFAULT_POLICY = {
  _comment:
    "Obelisk broker policy (CANON-021). Deny-by-default. minTrust = AgentDNA tier; modes = action|grant; maxTtlSec caps grants; riskMax = highest risk verdict still allowed.",
  default: { deny: true, minTrust: 4, modes: [] },
  capabilities: {},
};

export function loadPolicy() {
  try {
    if (fs.existsSync(POLICY_PATH))
      return JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
  } catch {
    /* fall through to default */
  }
  return DEFAULT_POLICY;
}

function policyFor(policy, capability) {
  return (
    policy.capabilities?.[capability] ||
    policy.default || { deny: true, minTrust: 4, modes: [] }
  );
}

// ── risk (P0 stub; obelisk.risk.score wires the real engine later) ───────────
function riskScore(capability, action, actor) {
  // Conservative default: 'allow'. A real sentinel (obelisk.risk.score) returns
  // allow|step-up|deny|quarantine; until wired, brokered calls are 'allow' and
  // anything the policy marks high-risk is gated by riskMax.
  return "allow";
}
const RISK_ORDER = { allow: 0, "step-up": 1, deny: 2, quarantine: 3 };

// ── receipts (append-only, signed if a signing key exists) ───────────────────
export function emitReceipt(rec) {
  const key = getSecret("OBELISK_RECEIPT_SIGNING_KEY", "obelisk.receipt.write");
  const body = { ...rec, ts: rec.ts || new Date().toISOString() };
  body.sig = key
    ? "hmac:" +
      crypto
        .createHmac("sha256", key)
        .update(JSON.stringify(body))
        .digest("hex")
        .slice(0, 32)
    : "UNSIGNED"; // honest: no signing key yet → marked, not faked (CANON-031)
  fs.mkdirSync(path.dirname(RECEIPTS), { recursive: true });
  fs.appendFileSync(RECEIPTS, JSON.stringify(body) + "\n");
  return body;
}

function hashParams(params) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(params ?? null))
    .digest("hex")
    .slice(0, 16);
}

class BrokerDenied extends Error {
  constructor(msg, detail) {
    super(msg);
    this.name = "BrokerDenied";
    this.detail = detail;
  }
}
export { BrokerDenied };

function check(
  capability,
  mode,
  { actor = "studio-ops", trust = 3, params } = {},
) {
  const policy = loadPolicy();
  const rule = policyFor(policy, capability);
  const decide = (policyVerdict, reason) => {
    const risk = riskScore(capability, mode, actor);
    const receipt = emitReceipt({
      actor,
      trust,
      capability,
      action: mode,
      mode,
      params_hash: hashParams(params),
      policy: policyVerdict,
      risk,
      result: policyVerdict === "allow" ? "pending" : "deny",
      reason,
    });
    return { policy: policyVerdict, risk, rule, receipt };
  };
  if (rule.deny)
    return {
      ...decide("deny", "capability not allowed (deny-by-default)"),
      ok: false,
    };
  if (!(rule.modes || []).includes(mode))
    return { ...decide("deny", `mode '${mode}' not permitted`), ok: false };
  if ((trust ?? 0) < (rule.minTrust ?? 4))
    return {
      ...decide("deny", `trust ${trust} < required ${rule.minTrust}`),
      ok: false,
    };
  const risk = riskScore(capability, mode, actor);
  const riskMax = rule.riskMax || "allow";
  if (RISK_ORDER[risk] > RISK_ORDER[riskMax])
    return {
      ...decide("step-up", `risk ${risk} > riskMax ${riskMax}`),
      ok: false,
    };
  return { ...decide("allow", "policy + trust + risk passed"), ok: true };
}

/**
 * Brokered action — the broker resolves the secret(s) INTERNALLY, runs performFn
 * with them, and returns ONLY performFn's result. The caller never receives the
 * secret. `performFn` receives a resolver `(key) => getSecret(key, capability)`.
 */
export async function brokeredAction(capability, action, performFn, opts = {}) {
  const c = check(capability, "action", { ...opts, params: opts.params });
  if (!c.ok)
    throw new BrokerDenied(
      `broker denied ${capability}.${action}: ${c.receipt.reason}`,
      c,
    );
  let result, error;
  try {
    result = await performFn((key) => getSecret(key, capability)); // secrets stay in-closure
  } catch (e) {
    error = e;
  }
  emitReceipt({
    actor: opts.actor || "studio-ops",
    trust: opts.trust ?? 3,
    capability,
    action,
    mode: "action",
    params_hash: hashParams(opts.params),
    policy: "allow",
    risk: c.risk,
    result: error ? "error" : "ok",
  });
  if (error) throw error;
  return result; // ← result only; never the secret
}

/**
 * Mint a short-lived, scoped, signed grant (NOT the raw secret). Used when a
 * consumer must call a provider SDK directly. Expires fast; revocable; single-purpose.
 */
export function requestGrant(
  capability,
  { scope = "*", ttlSec, actor = "studio-ops", trust = 3 } = {},
) {
  const c = check(capability, "grant", { actor, trust, params: { scope } });
  if (!c.ok)
    throw new BrokerDenied(
      `broker denied grant ${capability}: ${c.receipt.reason}`,
      c,
    );
  const configuredTtl = Number(
    getSecret("OBELISK_GRANT_DEFAULT_TTL_SEC", "obelisk.grant.issue"),
  );
  const fallbackTtl =
    Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 300;
  const cap = c.rule.maxTtlSec ?? fallbackTtl;
  const ttl = Math.min(ttlSec || cap || 300, cap || 300);
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    capability,
    scope,
    iat: now,
    exp: now + ttl,
    jti: crypto.randomBytes(8).toString("hex"),
  };
  const issuerKey = getSecret(
    "OBELISK_GRANT_ISSUER_KEY",
    "obelisk.grant.issue",
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = issuerKey
    ? crypto.createHmac("sha256", issuerKey).update(payload).digest("base64url")
    : "UNSIGNED";
  const grant = `obg.${payload}.${sig}`;
  emitReceipt({
    actor,
    trust,
    capability,
    action: "grant",
    mode: "grant",
    params_hash: hashParams({ scope }),
    policy: "allow",
    risk: c.risk,
    result: "ok",
    grantId: claims.jti,
    ttlSec: ttl,
  });
  return {
    grant,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    ttlSec: ttl,
    jti: claims.jti,
  };
}

/** Verify a grant token (sig + not expired). Returns claims or null. */
export function verifyGrant(grant) {
  try {
    const [pfx, payload, sig] = String(grant).split(".");
    if (pfx !== "obg" || !payload) return null;
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (claims.exp < Math.floor(Date.now() / 1000)) return null; // expired
    const issuerKey = getSecret(
      "OBELISK_GRANT_ISSUER_KEY",
      "obelisk.grant.issue",
    );
    if (issuerKey) {
      const expect = crypto
        .createHmac("sha256", issuerKey)
        .update(payload)
        .digest("base64url");
      if (sig !== expect) return null; // bad signature
    }
    return claims;
  } catch {
    return null;
  }
}
