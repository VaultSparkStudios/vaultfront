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

<!-- Universal AGENTS.md sections — propagate to every Studio repo via scripts/run-template-propagation.mjs -->
<!-- Owner: Studio Ops · Source: docs/templates/project-system/AGENTS_universal_sections.md -->
<!-- Last revised: 2026-04-30 (Session 70 — adds Capabilities Index + Secrets + Sitemap pointers) -->

## Skill & Capability Discovery (CANON-012)

If you (Claude / Codex / subagent / managed agent) need to do something and don't know the right command, **check the Studio capabilities index first** before declaring the task blocked or unknown.

- **Master index:** `vaultspark-studio-ops/docs/AGENT_CAPABILITIES.md` — every skill, script, agent role, MCP tool, and credential capability available studio-wide. Auto-regenerated nightly + on closeout.
- **Natural-language lookup:** `node ../vaultspark-studio-ops/scripts/ops.mjs cap "<intent>"` — describe what you need ("send an email", "deploy to Cloudflare", "check uptime") and it returns the matching capability.
- **Slash-command list (Claude):** `~/.claude/skills/`. **Codex:** `~/.agents/skills/`.
- **Cheatsheet:** `vaultspark-studio-ops/docs/SKILL_MAP.md`.

If nothing matches, **file an innovation candidate** (it goes into the next genius list) — do not surface as a human-blocker until you've checked the index and run the elevated-probe step.

---

## Secrets Discovery (CANON-012)

All Studio credentials live in **`vaultspark-studio-ops/secrets/`**. Every project, every agent, every script reads from here. Never read `.env` directly in subprocesses; never assume `process.env.X` is set.

**Before declaring any task "Human Action Required":**

```bash
node ../vaultspark-studio-ops/scripts/check-secrets.mjs --for <capability>
```

If the capability returns READY → proceed autonomously. If MISSING → check `vaultspark-studio-ops/secrets/CAPABILITY_MAP.json` for the canonical env var names, then run `/intake-credentials` if the founder needs to supply them. The "phantom blocker" pattern (labeling something human-blocked when the credential is already present) is forbidden by canon.

**Resolving a secret in code:**

```js
import { getSecret, resolveCapability, redact } from 'vaultspark-studio-ops/scripts/lib/secrets.mjs';
const key = await getSecret('STRIPE_SECRET_KEY', 'stripe.checkout');
console.log(redact(`Using ${key}`));
```

**Stripe Agent Payments** (autonomous spend on behalf of agents — ad spend, domain renewal, infra top-up): use capability `stripe.agent-payments` with built-in spend-cap. Reference: https://stripe.com/blog/giving-agents-the-ability-to-pay · Audit log: `secrets/.payments.log`.

Full protocol: `vaultspark-studio-ops/docs/SECRETS_PROTOCOL.md`.

---

## Sitemap Standard (CANON-011 · public-facing projects only)

If this project's `audience` is `public-*`, every page in `docs/PROJECT_SITEMAP_STANDARD.md` must exist and pass the quality bars (LCP <1.8s · CWV green · CSP strict · `/agents.json` · `/.well-known/llms.txt` · sitemap.xml). Reference exemplars: vaultsparkstudios.com · vorn.app · mindframe.app.

Audit: `node ../vaultspark-studio-ops/scripts/check-sitemap-compliance.mjs --project <slug>`.

Project must score ≥8/10 before flipping to SPARKED. `app-release-gate` enforces.

---

## Elevated-access protocol (S113 — apply migrations yourself)

When a sprint deliverable lists "Founder action needed" steps that are **scripted** (`wrangler deploy`, `wrangler secret put`, `gh workflow run`, `node scripts/migrate-*.mjs --apply`, `hcloud …`, `gcloud …`, etc.), the agent **must execute them itself** using the relevant gateway capability — not leave them for the founder.

**Reserve "Human Action Required" only for:**
- Hardware key enrollment (FIDO2, Yubikey)
- Provider dashboard signup / account creation
- Billing / payment confirmation
- Destructive operations explicitly gated by CANON (force-push to main, npm publish, etc.)

Safe scripted migrations are agent work, not founder work. The founder-twin auto-approves the safe patterns; deny patterns still gate at the founder. Use `node scripts/twin-ask.mjs <Tool> <input>` for cross-agent verdict (Codex) or rely on the PreToolUse hook (Claude Code).

---

## Founder-Twin auto-approval (S113 — cross-agent)

Both Claude Code and Codex consult one shared auto-approval model. Same brain, same history, same audit trail — patterns learned by one agent benefit every agent.

**Codex usage** (no native PreToolUse hook — call explicitly before risky commands):

```bash
node ../vaultspark-studio-ops/scripts/twin-ask.mjs Bash "<command>"
# exit 0 = approve · exit 1 = ask · exit 2 = deny
```

**Claude Code:** wired automatically via `~/.claude/settings.json` → `hooks.PreToolUse`.

Disable per-session: `export TWIN_DISABLED=1`. Full spec: `vaultspark-studio-ops/docs/TWIN_PROTOCOL.md`.

---

## Universal `/audit` + `/implement` (S113)

Two project-agnostic skills for both agents:

- `/audit` — genius-level 9-axis project audit → writes `docs/AUDIT_<date>.md`
- `/implement` — read latest `AUDIT_*.md` and ship every item in optimal-efficiency order

Project-type aware via `portfolio/PROJECT_REGISTRY.json` → `type`. Personal-scope canonical at `~/.claude/skills/` (Claude) and `~/.agents/skills/` (Codex mirror, auto-synced).

---

<!-- studio-os:universal-sections-end -->
