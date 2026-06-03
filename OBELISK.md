# Obelisk Posture — VaultFront

**Canon:** CANON-021 · D-S119.2
**Project slug:** `vaultfront`
**Declared at:** {{DATE}}
**Owner:** {{OWNER}}

## Posture

`pending`

> Set to one of: `not-applicable` · `pending` · `phase-0-declared` · `phase-1-pilot` · `phase-2-mcp` · `phase-3-ops-integrated` · `phase-4-public-app-migrated`

## Current auth surfaces

> Auto-detected by `node scripts/obelisk-inventory.mjs --slug vaultfront`. Run it and paste/summarize findings here.

- [ ] Password sign-in forms
- [ ] Raw API keys in env (static bearer tokens)
- [ ] OAuth/JWT bearer tokens
- [ ] Unregistered MCP servers
- [ ] Secret-bearing prompts

## Migration plan

| Phase | What lands in this repo                                             | Target session |
| ----- | ------------------------------------------------------------------- | -------------- |
| 0     | Canon + posture declared (this file)                                | —              |
| 1     | Passkey-first founder/internal login + TOTP recovery + device trust | —              |
| 2     | MCP firewall + capability passports                                 | —              |
| 3     | Studio Ops integration — `obelisk doctor`, intent receipts          | —              |
| 4     | Public app migration — sign-up/sign-in passkey-first                | —              |

## Capability grants used

> List the `obelisk.*` capabilities this repo will consume (declared in studio-ops `secrets/CAPABILITY_MAP.json`).

- [ ] `obelisk.passkey-issuer`
- [ ] `obelisk.totp-secret`
- [ ] `obelisk.signing-key`
- [ ] `obelisk.mcp-registry-signer`

## Public-claim guardrails

- [ ] Acknowledged: NEVER market as "unhackable" / "quantum-proof" / "custom SSL"
- [ ] Approved language adopted: "passkey-first" / "post-quantum migration-ready" / "WebAuthn-backed"

## Notes

> Project-specific Obelisk considerations, blockers, exceptions.

---

_Template v1.0 · CANON-021 · Hub source-of-truth at `vaultspark-studio-hub/docs/OBELISK_PROTOCOL_PLAN.md`_
