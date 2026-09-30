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
<!-- DO NOT EDIT — re-run via /start deferred-propagation hook or scripts/propagate-agents-sections.mjs -->

<!-- Universal Studio OS operational entrypoint; generated scope is owned by scripts/lib/execution-contract.mjs. -->

## Scope and action gates

<!-- execution-contract:start -->
Complete the selected outcomes and their acceptance checks. Stop when they are verified. Explore and Maintain require an explicitly requested boundary. Budgets are ceilings. Unused tokens, an empty queue, or historical velocity never authorize additional work or greater depth. Partial, blocked, deferred, stale, or unmeasured evidence is not verified completion. Keep remaining authorized work visible. Preserve the user's scope and existing authorization. Apply the gates required by the action. Explicit /start and /closeout keep their canonical protocols.
Action owners and triggers: docs/EXECUTION_CONTRACT.md.
<!-- execution-contract:end -->

The gate owners, triggers and required actions live in **docs/EXECUTION_CONTRACT.md**. Load the relevant section of **docs/AGENT_ACTION_REFERENCE.md** for command examples; full canon is **docs/STUDIO_CANON.md**. From a sibling, use the studio-ops control plane for secrets/capabilities/Ark; prefer local project scripts for project measurements and verify the target identity when falling back.

<!-- canon-section: hard-gates -->
### Before a human-blocked label — implementer owns evidence

CANON-019: run secrets discovery for the capability and `ops.mjs blocker-preflight`; try the available agent path and log evidence. Hardware-key enrollment, provider signup, billing confirmation and canon-gated destructive acts may need the founder. Unknown credentials or failed guesses alone are not evidence of a human blocker.

<!-- canon-section: canon-conformance -->
### Explicit /start or /initiate — session agent owns reconciliation

Run `start-canon-sync.mjs --project . --slug <slug> --json`, `check-canon-conformance.mjs --project . --offline`, and adoption `--suggest` then `--check` (initiate/refresh uses `--write`). Read live canon when uncertain. ABSOLUTE gaps stop the affected action; justify STRONG gaps in DECISIONS. Distinguish manual, doctor-owned and unmeasured checks from conformed. At /start run Windows Git guard and `frontier-capability-radar.mjs --refresh-if-stale --write --json`; failed/stale sources remain unknown. Radar candidates do not authorize installs, spending or expanded access.

<!-- canon-section: secrets -->
### Credentials — secrets gateway owns resolution

CANON-012: resolve `getSecret` / `resolveCapability` through Studio Ops `scripts/lib/secrets.mjs`; use `redact()`. Never print credentials, read .env directly in subprocesses, or assume ambient keys. Capability names come from `secrets/CAPABILITY_MAP.json`. Credentials stay in ignored `secrets/`.

<!-- canon-section: founder-twin -->
<!-- canon-section: broad-approval -->
### Mutations and privileged actions — project agent plus Founder-Twin

CANON-024: before side-effecting/networked/privileged/cross-repo/payment/secret work verify intent, resolved scope, trust, gateway use, blast radius/rollback and Twin verdict. Stop on deny; reuse existing bounded founder authorization. Do not seek broad approval for destructive operations, arbitrary interpreters, download-and-execute, secrets, force-push, publish, production destruction, billing or legal changes. Escalate canon, public promises, rights/provenance, licensing, launch dates, security/data-handling policy changes. See `docs/TWIN_PROTOCOL.md`.

### Windows and command output — invoking agent owns isolation

At /start run `install-git-window-guard.mjs --apply`. Use `scripts/lib/safe-spawn.mjs` and hidden noninteractive processes; no visible terminal storms. Never park logs in a parent/sibling directory. Use an ignored in-repo cache or OS temp.

<!-- canon-section: package-trust -->
### Dependencies and downloads — Package Trust owns the artifact verdict

CANON-023: before install/download, run `package-trust.mjs --package <name>@<version>`; BLOCK means choose another verified option. Archives, binaries, scripts, model weights and extensions require trust verification. After lockfile changes/before push run `scan-npm-supply-chain.mjs --json`.

<!-- canon-section: ark-transport -->
<!-- canon-section: co-authoring -->
### Cross-repo work — recipient owns application and proof

Never write directly to sibling files. Ship signed Ark cargo; respect recipient locks, producer allowlists and queued propagation. Designer owns source; Studio Ops mechanizes/propagates; recipient implementer applies and verifies. Every work handoff names outcome, owner, artifact/version, dependency and acceptance evidence. Received/accepted/applied/verified are distinct; delivery alone proves no adoption. Project creative approval stays local. See `docs/STUDIO_ARK.md`.

<!-- canon-section: skill-discovery -->
<!-- canon-section: audit-implement -->
### Capability selection — task owner checks reuse and runtime evidence

Use `docs/INTERNAL_TOOLS.md` before building, `ops.mjs cap "<intent>"` before declaring a capability missing, and `docs/SKILL_MAP.md` for commands. /audit produces the executable sidecar; /implement verifies selected premises and outcomes. Cloudflare questions require current official docs. Model choices require current provider evidence AND runtime availability; API IDs, CLI selectors and subscription choices are separate. Preserve intentional pins, cost gates and failed-source uncertainty. Reuse the shared model routers.

### Public surfaces, media and releases — implementer/release owner

Load **docs/AGENT_ACTION_REFERENCE.md → Public-facing project requirements** before public UI, identity or release work. All applicable CANON-006/007/008/011/029/030/041/045/047/048/051/053/054/055 gates still apply: branding/legal/contact, free-tier cost, sitemap and agent access, Obelisk identity, staging, themes/mobile/performance, security and surface follow-through. SPARKED requires founder approval. CANON-053 is mandatory during UI work: real before/after images, desktop/mobile, every theme/touched state, inspect/fix/recapture and hash-bound visual receipt. Private media work uses its medium-specific checker; missing footage/rights/export review is nonpassing and proof is not publishing permission. Public pushes load the sanitization protocol; exclude secrets, CDR, private strategy/lore and local paths.

### Closeout — session owner

Use `render-closeout-checklist.mjs` and SESSION_PROTOCOL §3. Preserve ordered write-back and append-only DECISIONS/SIL/CDR; CDR only on explicit creative direction. Validate `silScore == sum(silCategoriesV3)`, ten categories each 0–100, via `write-project-status.mjs --check`. Reconcile wave/task state and background shells. Infrastructure engagement uses the infra rubric. Closeout records partial work honestly; it never turns deferred work into success.

<!-- canon-index:start -->
<!-- GENERATED from STUDIO_CANON.md by scripts/gen-agents-canon-index.mjs — DO NOT EDIT BY HAND. -->
<!-- Refresh: `node scripts/gen-agents-canon-index.mjs --apply` from studio-ops. -->

**Studio Canon — index.** Full text + rationale for every entry: **vaultspark-studio-ops/docs/STUDIO_CANON.md** (jump to the matching `## CANON-NNN` heading). These are studio-wide defaults; you are expected to follow them. Read the full entry before acting on anything you're unsure about, and before changing canon, public promises, rights, licenses, launch dates, or security/data handling.

- **CANON-001** · Rolling Status headers use HTML comment markers for programmatic identification
- **CANON-002** · Sessions 1–3 are a Calibration Window, excluded from studio-level averaging
- **CANON-003** · prompts/initiate.md is separate from prompts/start.md for token efficiency
- **CANON-004** · studioOsApplied: true requires Layer 1 SIL format, not just a context/ folder
- **CANON-005** · CDR gap recovery check is mandatory at startup and closeout for compacted sessions
- **CANON-006** · Every public-facing product must display VaultSpark Studios branding with a link-back
- **CANON-007** · Every project must have a staging environment before deploying to production
- **CANON-008** · All VaultSpark IP is proprietary by default; open-source licenses are explicit exceptions only
- **CANON-009** · SIL rubric is 10 × 100 = 1000
- **CANON-010** · Claude Code and Codex must have strict skills + hooks + MCP parity
- **CANON-011** · Every public-facing project must follow the universal sitemap standard
- **CANON-012** · Every studio agent resolves credentials via the secrets gateway
- **CANON-013** · Every project picks one of 3 canonical low-cost archetypes at `/initiate`
- **CANON-015** · Claude Max Plan first; API requires founder approval + cost estimate
- **CANON-016** · Studio OS protocol/process/enforcement propagates ecosystem-wide
- **CANON-017** · Free, long-term, scaleable integrations preferred; build-vs-buy bias toward build
- **CANON-018** · All cross-repo agent communication MUST flow through Studio Ark
- **CANON-019** · Founder-Action Discipline
- **CANON-020** · Analytica is the canonical Studio analytics + insight plane
- **CANON-021** · Obelisk is the Studio-wide trust + capability protocol
- **CANON-022** · Agent Co-Authoring Protocol
- **CANON-023** · Obelisk Package Trust gates every agent install/download
- **CANON-024** · Broad approvals require non-malicious action verification
- **CANON-025** · Trinity role separation: VEILOS · IGNIS · Obelisk
- **CANON-026** · IGNIS visibility scope
- **CANON-027** · PQC migration-ready language discipline
- **CANON-028** · Founder Identity Privacy
- **CANON-029** · Free-Tier Cost Discipline
- **CANON-030** · Acronym Expansion in Public Content
- **CANON-031** · Observability Honesty
- **CANON-032** · Build-Optimal for Flagships
- **CANON-033** · Launch Announcement Discipline
- **CANON-034** · Browser Experience Excellence
- **CANON-035** · Project Brand Identity
- **CANON-036** · Deploy Currency Discipline
- **CANON-037** · Canon Half-Life and Automated Consistency
- **CANON-038** · Shared Studio Self-Host Server
- **CANON-039** · Build-It-Ourselves, Internal-First, OSS-Research Discipline
- **CANON-040** · Agent-Deployed Migrations
- **CANON-041** · Website Mobile Parity + Elite Visual Craft
- **CANON-042** · Studio Branding System: approved usages, DBA rule, and the elite auto-updating footer
- **CANON-043** · Baseline repository security hygiene
- **CANON-044** · In-session task scaffolding (Phase/Wave lists), reconciled at closeout
- **CANON-045** · Obelisk is the unified studio identity + auth plane
- **CANON-046** · Canon weighting: tiers + autonomy-first conflict resolution
- **CANON-047** · Theme system + AI-verified human readability
- **CANON-048** · Dual-audience ecosystem: every surface built for Humans AND AI Agents
- **CANON-049** · Continuous evolution: the studio + every project is never static
- **CANON-050** · Atlas: the foundation that carries the ecosystem — and the standard it is held to
- **CANON-051** · Web Hardening: every public surface meets the edge-security + standard-files baseline
- **CANON-052** · Project Lifecycle Ladder: FORGE/SPARKED/VAULTED with sub-stages, gated transitions, and a single write path
- **CANON-053** · Rendered-Pixel UI Discipline: look at the real interface while building it
- **CANON-054** · Public Stats Surface: every website reports and analyzes its own numbers
- **CANON-055** · Surface Follow-Through: every project change reaches the thing people actually touch

<!-- canon-index:end -->

---

> Each canon above is mechanized in studio-ops (doctor probe / capability / template / propagation). To act on one, read its full entry in `vaultspark-studio-ops/docs/STUDIO_CANON.md`. To propose a new canon, ship `canon-update` cargo to studio-ops — never edit a sibling repo's canon directly.

<!-- studio-os:universal-sections-end -->
