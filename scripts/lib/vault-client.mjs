/**
 * vault-client.mjs — Anthropic Credential Vault API client (beta)
 *
 * What credential vaults store:
 *   - OAuth tokens for MCP servers (auto-refreshed by Anthropic)
 *   - Static API keys/bearer tokens for MCP tool connections
 *   NOT a general secrets store — Stripe keys, GitHub PATs stay in secrets/
 *
 * Studio OS use cases:
 *   - Sentry MCP bearer token (HTTP MCP server — vault is the right home)
 *   - Google Calendar / Drive / Gmail OAuth tokens
 *   - Any future MCP server requiring OAuth
 *
 * Usage:
 *   import { VaultClient } from './lib/vault-client.mjs';
 *   const vault = new VaultClient(process.env.ANTHROPIC_API_KEY);
 *   const id = await vault.createVault('studio-ops');
 *   await vault.addStaticCredential(id, 'sentry', process.env.SENTRY_TOKEN, 'https://mcp.sentry.dev/mcp');
 *
 * CLI:
 *   node scripts/ops.mjs vault list
 *   node scripts/ops.mjs vault create <name>
 *   node scripts/ops.mjs vault add-static <vault_id> <name> <token> <mcp_url>
 */

import https from "node:https";
import { callAnthropicRaw } from "./model-router.mjs";

const VAULT_BETA = "managed-agents-2026-04-01";

export class VaultClient {
  constructor(apiKey) {
    if (!apiKey) throw new Error("VaultClient requires ANTHROPIC_API_KEY");
    this.apiKey = apiKey;
  }

  _req(method, path, body = null) {
    return callAnthropicRaw(
      { apiKey: this.apiKey, method, path, body, betaHeader: VAULT_BETA },
      https,
    );
  }

  async createVault(displayName, metadata = {}) {
    const r = await this._req("POST", "/v1/vaults", {
      display_name: displayName,
      metadata,
    });
    if (r.body.error)
      throw new Error(`Create vault failed: ${r.body.error.message}`);
    console.log(`Created vault: ${r.body.id} (${displayName})`);
    return r.body.id;
  }

  async listVaults() {
    const r = await this._req("GET", "/v1/vaults");
    if (r.body.error)
      throw new Error(`List vaults failed: ${r.body.error.message}`);
    return r.body.data ?? [];
  }

  async addStaticCredential(vaultId, displayName, token, mcpServerUrl) {
    // S107.7 probed shape: auth.type='static_bearer' requires exactly
    // `token` + `mcp_server_url` (both required; `api_key` + `bearer_token`
    // + `server_url` all rejected).
    const r = await this._req("POST", `/v1/vaults/${vaultId}/credentials`, {
      display_name: displayName,
      auth: { type: "static_bearer", token, mcp_server_url: mcpServerUrl },
    });
    if (r.body.error)
      throw new Error(`Add credential failed: ${r.body.error.message}`);
    console.log(`Added static credential: ${r.body.id} (${displayName})`);
    return r.body.id;
  }

  async addOAuthCredential(vaultId, displayName, mcpServerUrl, oauthConfig) {
    const r = await this._req("POST", `/v1/vaults/${vaultId}/credentials`, {
      display_name: displayName,
      auth: { type: "mcp_oauth", mcp_server_url: mcpServerUrl, ...oauthConfig },
    });
    if (r.body.error)
      throw new Error(`Add OAuth credential failed: ${r.body.error.message}`);
    console.log(`Added OAuth credential: ${r.body.id} (${displayName})`);
    return r.body.id;
  }

  async listCredentials(vaultId) {
    const r = await this._req("GET", `/v1/vaults/${vaultId}/credentials`);
    if (r.body.error)
      throw new Error(`List credentials failed: ${r.body.error.message}`);
    return r.body.data ?? [];
  }

  async deleteCredential(vaultId, credentialId) {
    const r = await this._req(
      "DELETE",
      `/v1/vaults/${vaultId}/credentials/${credentialId}`,
    );
    if (r.status !== 200)
      throw new Error(`Delete failed: ${JSON.stringify(r.body)}`);
    console.log(`Deleted credential: ${credentialId}`);
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const isMain = process.argv[1]?.endsWith("vault-client.mjs");
if (isMain) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  const vault = new VaultClient(apiKey);
  const [, , cmd, ...rest] = process.argv;

  if (cmd === "list") {
    const vaults = await vault.listVaults();
    if (!vaults.length) {
      console.log("No vaults found.");
      process.exit(0);
    }
    for (const v of vaults) {
      console.log(`\n${v.id}  ${v.display_name}`);
      const creds = await vault.listCredentials(v.id);
      for (const c of creds)
        console.log(`  · ${c.id}  ${c.display_name}  (${c.auth?.type})`);
    }
  } else if (cmd === "create") {
    await vault.createVault(rest[0] ?? "studio-ops", { project: "studio-ops" });
  } else if (cmd === "add-static") {
    const [vaultId, name, token, mcpUrl] = rest;
    if (!vaultId || !name || !token || !mcpUrl) {
      console.error("Usage: add-static <vault_id> <name> <token> <mcp_url>");
      process.exit(1);
    }
    await vault.addStaticCredential(vaultId, name, token, mcpUrl);
  } else {
    console.log(
      "Commands: list | create <name> | add-static <vault_id> <name> <token> <mcp_url>",
    );
  }
}
