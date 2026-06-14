# Project Agent Guide

## Session Protocol (agent-neutral — applies to Claude Code, Codex, any agent)

The canonical execution protocol for every Studio OS session lives in **`docs/SESSION_PROTOCOL.md`** in this repo (propagated from studio-ops).

It covers the 3-command rhythm (`/start` → `/go` → `/closeout`), full protocol for 15 commands, and agent-specific notes for Claude Code + Codex. Both agents execute the same instructions; per-agent branching is flagged explicitly with `IF agent = claude-code:` / `IF agent = codex:`.

See `docs/SKILL_MAP.md` for the one-page command cheatsheet.

This public repository contains deployable project code and public-safe documentation.

Public-safe rule:

- keep deployable code and browser-safe configuration in this repo
- keep internal operating procedures, private planning, secret-handling workflows, and detailed studio process docs in the private Studio OS / ops repository

## IP and Licensing (CANON-008)

All VaultSpark Studios code, content, assets, and designs are **proprietary by default**. All rights are reserved by VaultSpark Studios LLC unless a license is explicitly declared and approved by the Studio Owner.

**Agent rules:**

- Never add a `LICENSE` file with open-source terms unless explicitly instructed by the Studio Owner
- Never label a page, readme, or doc as "open source" for VaultSpark-original work
- Attribution/compliance pages on public sites must use proprietary-first language
- `docs/RIGHTS_PROVENANCE.md` default: `License: Proprietary — All Rights Reserved, VaultSpark Studios LLC`

**Exceptions (legal obligations — not discretionary):**
Any project forked from a copyleft-licensed upstream must declare its license in `context/DECISIONS.md` and `docs/RIGHTS_PROVENANCE.md`. Check `docs/RIGHTS_PROVENANCE.md` for this project's obligations.

Full decision: `vaultspark-studio-ops/docs/STUDIO_CANON.md` → CANON-008

---

---

<!-- studio-os:universal-sections-start -->
<!-- Source: vaultspark-studio-ops/docs/templates/project-system/AGENTS_universal_sections.md -->
<!-- DO NOT EDIT — re-run `node scripts/propagate-agents-sections.mjs --apply` from studio-ops to refresh -->

<!-- Universal AGENTS.md sections — propagated to every Studio repo via scripts/propagate-agents-sections.mjs -->
<!-- Owner: Studio Ops · Source: docs/templates/project-system/AGENTS_universal_sections.md -->
<!-- Last revised: 2026-06-07 (S158 — lean rewrite: canon prose → generated index + pointers; ~32KB→~10KB) -->

> **This block is the studio-wide operational layer, shared by every VaultSpark repo.** It carries the gates and pointers you need resident every session. Full canon prose lives once, in `vaultspark-studio-ops/docs/STUDIO_CANON.md` — the index below points into it. Don't expand canon text back into this file; keep it lean.

## The hard gates (run before you label anything blocked)

**CANON-019 — Founder-Action Discipline. Default: try first; label blocked only with evidence.** Before any `Human Action Required` / `[BLOCKER]` / `FOUNDER ACTION` / `human-blocked` label, you MUST run + log:

```bash
node ../vaultspark-studio-ops/scripts/check-secrets.mjs --for <capability>   # 1. secrets discovery (phantom-blocker = forbidden)
node ../vaultspark-studio-ops/scripts/ops.mjs blocker-preflight              # 2. elevated/admin probe
# 3. credential READY → execute it yourself via the secrets gateway
# 4. admin probe reveals an agent-path → execute it
```

Reserve human-blocked **only** for: hardware-key enrollment · provider dashboard signup · billing/payment confirmation · CANON-gated destructive ops (force-push to main, npm publish, prod DB drop). **Everything else is agent work** — apply scripted migrations/deploys/secret-puts yourself (`wrangler deploy`, `wrangler secret put`, `gh secret set`, `gcloud …`, `node scripts/migrate-*.mjs --apply`). The founder-twin auto-approves safe patterns; deny patterns still gate at the founder.

## Secrets gateway (CANON-012)

All Studio credentials live in **`vaultspark-studio-ops/secrets/`** — every project, every agent reads from there. Never read `.env` directly in subprocesses; never assume `process.env.X` is set.

```js
import {
  getSecret,
  resolveCapability,
  redact,
} from "vaultspark-studio-ops/scripts/lib/secrets.mjs";
const key = await getSecret("STRIPE_SECRET_KEY", "stripe.checkout");
console.log(redact(`Using ${key}`));
```

Capability → env-var names: `vaultspark-studio-ops/secrets/CAPABILITY_MAP.json`. MISSING credential → `/intake-credentials`. Never print raw secrets (`redact()` everything). Stripe Agent Payments (autonomous spend w/ cap): capability `stripe.agent-payments`. Full: `vaultspark-studio-ops/docs/SECRETS_PROTOCOL.md`.

## Founder-Twin — shared cross-agent approval brain (CANON-024)

One shared auto-approval model across Claude Code, Codex, and managed agents — patterns learned by one benefit all. **Claude Code:** wired via `~/.claude/settings.json` PreToolUse hook. **Codex/other:** call before risky commands — `node ../vaultspark-studio-ops/scripts/twin-ask.mjs Bash "<command>"` (exit 0=approve · 1=ask · 2=deny). Prefer one bounded command-family approval over piecemeal asks; never request broad approval for destructive/arbitrary-interpreter/`curl|sh`/heredoc/secret/force-push/publish/prod-destructive/billing/legal actions. Before any side-effecting/networked/privileged/cross-repo/payment/secret action verify: intent · scope (recursive ops resolve inside the intended dir) · trust (package-trust) · secrets-gateway-only · blast-radius+rollback · twin-verdict. Disable per-session: `export TWIN_DISABLED=1`. Spec: `vaultspark-studio-ops/docs/TWIN_PROTOCOL.md`.

## Package trust (CANON-023)

Before any `npm/pnpm/yarn/pip/cargo install`, `curl | sh`, archive/binary/model-weight download, or agent-suggested install command:

```bash
node ../vaultspark-studio-ops/scripts/package-trust.mjs --package <name>@<version>
```

`BLOCK` = hard stop, pick another option. Treat raw GitHub zips, shortened URLs, installers, shell scripts, model weights, and browser extensions as quarantined until verified. After lockfile changes / before push: `node ../vaultspark-studio-ops/scripts/scan-npm-supply-chain.mjs --json`. Protocol: `vaultspark-studio-ops/docs/OBELISK_PACKAGE_TRUST_PROTOCOL.md`.

## Cross-repo transport — Studio Ark (CANON-018)

**Never write directly to another repo's files. Ship cargo instead.** `/start` auto-drains your inbox (the `╔══ ARK STATUS ══╗` brief tile shows depth + sig health); receipts auto-emit on drain.

```bash
node scripts/ark.mjs ship --type pattern-share --to '*' --payload '{"pattern":"...","solution":"...","tags":["..."]}'
node scripts/ark.mjs ship --type repo-question --to '{"question":"...","replyTo":"my-slug"}' < slug > --payload
node scripts/ark.mjs ship --type agent-handoff --to '{"intent":"...","openFiles":["..."]}' < slug > --payload
```

Producer allowlist: `vaultspark-studio-ops/portfolio/ark/MANIFEST.json` (`canon-update` + `phantom-blocker-fix` are studio-ops only). Co-authoring roles (CANON-022): Designer owns source-of-truth · Mechanizer owns canon/probes/templates · Propagator owns cross-repo rollout (both studio-ops) · Implementer owns code. Design: `vaultspark-studio-ops/docs/STUDIO_ARK.md`.

## Skill & capability discovery (CANON-012)

Don't know the command? Check capabilities before declaring anything unknown or blocked: master index `vaultspark-studio-ops/docs/AGENT_CAPABILITIES.md` · NL lookup `node ../vaultspark-studio-ops/scripts/ops.mjs cap "<intent>"` · skills `~/.claude/skills/` (Claude) / `~/.agents/skills/` (Codex) · cheatsheet `vaultspark-studio-ops/docs/SKILL_MAP.md`. Universal skills: `/audit` (9-axis audit → `docs/AUDIT_<date>.md`) + `/implement` (ship the audit). No match → file an innovation candidate.

## Public-facing project requirements

For `audience: public-*` projects:

- **Sitemap (CANON-011):** every page in `vaultspark-studio-ops/docs/PROJECT_SITEMAP_STANDARD.md` exists + passes bars (LCP <1.8s · CWV green · strict CSP · `/agents.json` · `/.well-known/llms.txt` · sitemap.xml). Score ≥8/10 before SPARKED. Audit: `node ../vaultspark-studio-ops/scripts/check-sitemap-compliance.mjs --project <slug>`.
- **Website scaffold (D-S119.3):** before scaffolding any page, consult `vaultspark-studio-ops/portfolio/STUDIO_WEBSITE_SCAFFOLD/catalog.json` + `patterns.json`; use the consensus pattern unless SOUL justifies deviation (log in DECISIONS). Public signup → wire the Vault SSO contract (`vaultspark-studio-ops/docs/VAULT_SSO_CONTRACT.md`).
- **Enforce:** branding line per type (CANON-006), footer `© 2026 VaultSpark Studios LLC. All rights reserved.`, `/privacy` + `/terms`, acronyms spelled out on first use (CANON-030), free tier cost-neutral (CANON-029), staging before prod (CANON-007). `/app-release-gate` checks these before any SPARKED flip.

---

<!-- canon-index:start -->
<!-- GENERATED from STUDIO_CANON.md by scripts/gen-agents-canon-index.mjs — DO NOT EDIT BY HAND. -->
<!-- Refresh: `node scripts/gen-agents-canon-index.mjs --apply` from studio-ops. -->

**Studio Canon — index.** Full text + rationale for every entry: **vaultspark-studio-ops/docs/STUDIO_CANON.md** (jump to the matching `## CANON-NNN` heading). These are studio-wide defaults; you are expected to follow them. Read the full entry before acting on anything you're unsure about, and before changing canon, public promises, rights, licenses, launch dates, or security/data handling.

- **CANON-001** · Rolling Status headers use HTML comment markers for programmatic identification — The SIL Rolling Status header block is delimited by <!-- rolling-status-start --> and <!-- rolling-status-end --> HTML comment markers
- **CANON-002** · Sessions 1–3 are a Calibration Window, excluded from studio-level averaging — The first 3 sessions of any project are labeled "Calibration" and excluded from studio-level SIL averaging in portfolio/STUDIO_SIL.md until Session 4
- **CANON-003** · prompts/initiate.md is separate from prompts/start.md for token efficiency — Initiation protocol lives in prompts/initiate.md
- **CANON-004** · studioOsApplied: true requires Layer 1 SIL format, not just a context/ folder — A project is only considered studioOsApplied: true when it has the Layer 1 SIL format: Rolling Status header with HTML comment markers + closeout/start prompts with…
- **CANON-005** · CDR gap recovery check is mandatory at startup and closeout for compacted sessions — Both prompts/start.md and prompts/closeout.md include explicit instructions to check for and recover CDR entries from prior sessions that were never formally closed out…
- **CANON-006** · Every public-facing product must display VaultSpark Studios branding with a link-back — Every VaultSpark Studios product with audience: public-unlaunched, public-live, or public-traction must include a visible VaultSpark Studios branding element with a…
- **CANON-007** · Every project must have a staging environment before deploying to production — Every VaultSpark project must have a staging environment — local or Hetzner-hosted — where changes are tested before reaching production
- **CANON-008** · All VaultSpark IP is proprietary by default; open-source licenses are explicit exceptions only — All code, content, assets, and designs created by VaultSpark Studios are proprietary and all rights are reserved by VaultSpark Studios LLC unless an open-source license is…
- **CANON-009** · SIL rubric is 10 × 100 = 1000 — v3.0
- **CANON-010** · Claude Code and Codex must have strict skills + hooks + MCP parity — Every Studio OS command/skill/hook/MCP tool is available identically in Claude Code and OpenAI Codex
- **CANON-011** · Every public-facing project must follow the universal sitemap standard — Every VaultSpark project with audience: public-\* must implement the page set, quality bars (UX/speed/security/intelligence/SEO), /agents.json, and /.well-known/llms.txt…
- **CANON-012** · Every studio agent resolves credentials via the secrets gateway — Every Claude / Codex / subagent / managed-agent in every Studio repo MUST resolve credentials via getSecret(key, capability) from vaultspark-studio-ops/scripts/lib/secrets.mjs
- **CANON-013** · Every project picks one of 3 canonical low-cost archetypes at `/initiate` — Every new VaultSpark project picks ONE of three archetypes — A (Static SaaS/Marketing — Cloudflare Pages + Workers + D1), B (Real-time/multiplayer — adds Durable Objects),…
- **CANON-015** · Claude Max Plan first; API requires founder approval + cost estimate — When building features that invoke Claude, the default execution surface is the Claude Max Plan the studio already pays for
- **CANON-016** · Studio OS protocol/process/enforcement propagates ecosystem-wide — Studio OS protocol, process, and enforcement rules are not local to vaultspark-studio-ops — they ship to every project's agent-facing surfaces
- **CANON-017** · Free, long-term, scaleable integrations preferred; build-vs-buy bias toward build — When choosing project integrations on top of canonical infra (CANON-013 stack archetypes A/B/C + CANON-012 secrets gateway), agents must:
- **CANON-018** · All cross-repo agent communication MUST flow through Studio Ark — Studio Ark adopted as canon. All cross-repo intelligence rides the Ark. See docs/STUDIO_ARK.md
- **CANON-019** · Founder-Action Discipline — try first, label blocked only with evidence
- **CANON-020** · Analytica is the canonical Studio analytics + insight plane — Analytica elevated to canonical analytics + insight plane for the studio
- **CANON-021** · Obelisk is the Studio-wide trust + capability protocol — Obelisk adopted as Studio-wide trust + capability protocol; supersedes D-S119.2 (VaultRoot naming)
- **CANON-022** · Agent Co-Authoring Protocol — Agent Co-Authoring Protocol formalized. The Hub↔studio-ops Obelisk collaboration is now canonical pattern for all future cross-agent protocol work
- **CANON-023** · Obelisk Package Trust gates every agent install/download — Obelisk Package Trust adopted as the Studio-wide agent supply-chain decision gate
- **CANON-024** · Broad approvals require non-malicious action verification — Broad approval + non-malicious action verification adopted as the Studio-wide approval discipline
- **CANON-025** · Trinity role separation: VEILOS · IGNIS · Obelisk — Trinity role separation locked. See docs/PROPOSAL_2026-05-21_HIVEMIND.md for full 7-phase build plan (P1–P7, ~98h across 4–6 months)
- **CANON-026** · IGNIS visibility scope — private-by-default
- **CANON-027** · PQC migration-ready language discipline — PQC migration-ready language is canon. Override requires explicit founder direction logged in CDR
- **CANON-028** · Founder Identity Privacy — no personal name, no personal email
- **CANON-029** · Free-Tier Cost Discipline — no variable cost on free plans
- **CANON-030** · Acronym Expansion in Public Content — spell it out, acronym in parentheses
- **CANON-031** · Observability Honesty — no lying surfaces
- **CANON-032** · Build-Optimal for Flagships — no premature constraint
- **CANON-033** · Launch Announcement Discipline — no silent launches
- **CANON-034** · Browser Experience Excellence — browser is never second-class
- **CANON-035** · Project Brand Identity — every project designs its own professional logo, favicon, and brand kit
- **CANON-036** · Deploy Currency Discipline — production must not silently lag main

<!-- canon-index:end -->

---

> Each canon above is mechanized in studio-ops (doctor probe / capability / template / propagation). To act on one, read its full entry in `vaultspark-studio-ops/docs/STUDIO_CANON.md`. To propose a new canon, ship `canon-update` cargo to studio-ops — never edit a sibling repo's canon directly.

<!-- studio-os:universal-sections-end -->
