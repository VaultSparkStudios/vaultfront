# Studio action reference

Load only the section triggered by the current action. Current canon and docs/SESSION_PROTOCOL.md remain authoritative. Operational explanations and command examples were moved out of AGENTS.md in S357.

<!-- Universal AGENTS.md sections — propagated to every Studio repo via scripts/propagate-agents-sections.mjs -->
<!-- Owner: Studio Ops · Source: docs/templates/project-system/AGENTS_universal_sections.md -->
<!-- Last revised: 2026-06-07 (S158 — lean rewrite: canon prose → generated index + pointers; ~32KB→~10KB) -->

> **This block is the studio-wide operational layer, shared by every VaultSpark repo.** It carries the gates and pointers you need resident every session. Full canon prose lives once, in `vaultspark-studio-ops/docs/STUDIO_CANON.md` — the index below points into it. Don't expand canon text back into this file; keep it lean.

<!-- canon-section: hard-gates -->
## The hard gates (run before you label anything blocked)

**CANON-019 — Founder-Action Discipline. Default: try first; label blocked only with evidence.** Before any `Human Action Required` / `[BLOCKER]` / `FOUNDER ACTION` / `human-blocked` label, you MUST run + log:

```bash
node ../vaultspark-studio-ops/scripts/check-secrets.mjs --for <capability>   # 1. secrets discovery (phantom-blocker = forbidden)
node ../vaultspark-studio-ops/scripts/ops.mjs blocker-preflight              # 2. elevated/admin probe
# 3. credential READY → execute it yourself via the secrets gateway
# 4. admin probe reveals an agent-path → execute it
```

Reserve human-blocked **only** for: hardware-key enrollment · provider dashboard signup · billing/payment confirmation · CANON-gated destructive ops (force-push to main, npm publish, prod DB drop). **Everything else is agent work** — apply scripted migrations/deploys/secret-puts yourself (`wrangler deploy`, `wrangler secret put`, `gh secret set`, `gcloud …`, `node scripts/migrate-*.mjs --apply`). The founder-twin auto-approves safe patterns; deny patterns still gate at the founder.

<!-- canon-section: canon-conformance -->
## Canon conformance — know which canon apply to YOU (CANON-046 · D-S193.1)

Canon is **self-checking per project**, not a wall of rules you skim. At `/start` (and any time you're unsure), resolve which canon apply to this project, at what tier, and where you have gaps:

```bash
node ../vaultspark-studio-ops/scripts/check-canon-conformance.mjs --project . --offline
```

It reads `vaultspark-studio-ops/portfolio/CANON_MATRIX.json` (tier + applicability per canon, CANON-046) against the LIVE `docs/STUDIO_CANON.md` and classifies each applicable canon: **conformed/gap** (live per-project checkers) · **doctor-owned** · **portfolio** · **manual** (judgment canon, with a reason) · **unmeasured** (no automated check yet — an actionable coverage gap). An **ABSOLUTE-tier gap is a hard stop**; STRONG gaps need a one-line justification in `DECISIONS.md`. Full canon prose + tiers: `vaultspark-studio-ops/docs/STUDIO_CANON.md`; the machine-readable applicability matrix: `vaultspark-studio-ops/portfolio/CANON_MATRIX.json`.

<!-- canon-section: secrets -->
## Secrets gateway (CANON-012)

All Studio credentials live in **`vaultspark-studio-ops/secrets/`** — every project, every agent reads from there. Never read `.env` directly in subprocesses; never assume `process.env.X` is set.

```js
import { getSecret, resolveCapability, redact } from 'vaultspark-studio-ops/scripts/lib/secrets.mjs';
const key = await getSecret('STRIPE_SECRET_KEY', 'stripe.checkout');
console.log(redact(`Using ${key}`));
```

Capability → env-var names: `vaultspark-studio-ops/secrets/CAPABILITY_MAP.json`. MISSING credential → `/intake-credentials`. Never print raw secrets (`redact()` everything). Stripe Agent Payments (autonomous spend w/ cap): capability `stripe.agent-payments`. Full: `vaultspark-studio-ops/docs/SECRETS_PROTOCOL.md`.

<!-- canon-section: founder-twin -->
<!-- canon-section: broad-approval -->
## Founder-Twin — shared cross-agent approval brain (CANON-024)

One shared auto-approval model across Claude Code, Codex, and managed agents — patterns learned by one benefit all. **Claude Code:** wired via `~/.claude/settings.json` PreToolUse hook. **Codex (native, S219):** `<repo>/.codex/hooks.json` + `.codex/hooks/pre-tool-use-twin.mjs` (propagated template `codex-hooks/`) map twin verdicts to PreToolUse allow/deny; ask defers to normal prompts. **Older builds / other CLIs:** call before risky commands — `node ../vaultspark-studio-ops/scripts/twin-ask.mjs Bash "<command>"` (exit 0=approve · 1=ask · 2=deny). Prefer one bounded command-family approval over piecemeal asks; never request broad approval for destructive/arbitrary-interpreter/`curl|sh`/heredoc/secret/force-push/publish/prod-destructive/billing/legal actions. Before any side-effecting/networked/privileged/cross-repo/payment/secret action verify: intent · scope (recursive ops resolve inside the intended dir) · trust (package-trust) · secrets-gateway-only · blast-radius+rollback · twin-verdict. Disable per-session: `export TWIN_DISABLED=1`. Spec: `vaultspark-studio-ops/docs/TWIN_PROTOCOL.md`.

## Windows Git storm guard (Codex/Windows)

On Windows, Git must be non-interactive under agent control. Run `node ../vaultspark-studio-ops/scripts/install-git-window-guard.mjs --apply` at `/start` (or local `node scripts/install-git-window-guard.mjs --apply` when present). It idempotently sets user-env guard variables for future Codex/shell processes; Studio scripts additionally inherit the same guard through `scripts/lib/safe-spawn.mjs` + `windows-hide-shim.cjs`. Symptoms this prevents: repeated `C:\Program Files\Git\cmd\git.exe` windows, credential helper prompts, commit-editor windows during rebase/commit, and pager focus stealing.

## Command output never leaves your repo (S341 founder-reported)

Never redirect command output outside this repository — no `> ../build.log`, no `tee ../check.txt`. The folder above every repo is the founder's personal workspace; four sessions of one repo parking build/check/deploy logs there left 157 files among hand-made ones. Write logs to the agent scratchpad / OS temp (`$TEMP`, `os.tmpdir()`) or a gitignored in-repo dir such as `.cache/logs/`. If a frozen or purity-checked tree is why you want to write elsewhere, OS temp is the answer — the parent folder never is.

<!-- canon-section: package-trust -->
## Package trust (CANON-023)

Before any `npm/pnpm/yarn/pip/cargo install`, `curl | sh`, archive/binary/model-weight download, or agent-suggested install command:

```bash
node ../vaultspark-studio-ops/scripts/package-trust.mjs --package <name>@<version>
```

`BLOCK` = hard stop, pick another option. Treat raw GitHub zips, shortened URLs, installers, shell scripts, model weights, and browser extensions as quarantined until verified. After lockfile changes / before push: `node ../vaultspark-studio-ops/scripts/scan-npm-supply-chain.mjs --json`. Protocol: `vaultspark-studio-ops/docs/OBELISK_PACKAGE_TRUST_PROTOCOL.md`.

<!-- canon-section: ark-transport -->
## Cross-repo transport — Studio Ark (CANON-018)

**Never write directly to another repo's files. Ship cargo instead.** `/start` auto-drains your inbox (the `╔══ ARK STATUS ══╗` brief tile shows depth + sig health); receipts auto-emit on drain.

```bash
node scripts/ark.mjs ship --type pattern-share --to '*' --payload '{"pattern":"...","solution":"...","tags":["..."]}'
node scripts/ark.mjs ship --type repo-question --to <slug> --payload '{"question":"...","replyTo":"my-slug"}'
node scripts/ark.mjs ship --type agent-handoff --to <slug> --payload '{"intent":"...","openFiles":["..."]}'
```

<!-- canon-section: co-authoring -->
Producer allowlist: `vaultspark-studio-ops/portfolio/ark/MANIFEST.json` (`canon-update` + `phantom-blocker-fix` are studio-ops only). Co-authoring roles (CANON-022): Designer owns source-of-truth · Mechanizer owns canon/probes/templates · Propagator owns cross-repo rollout (both studio-ops) · Implementer owns code. Design: `vaultspark-studio-ops/docs/STUDIO_ARK.md`.

<!-- canon-section: skill-discovery -->
<!-- canon-section: audit-implement -->
## Skill & capability discovery (CANON-012)

Don't know the command? Check capabilities before declaring anything unknown or blocked: master index `vaultspark-studio-ops/docs/AGENT_CAPABILITIES.md` · NL lookup `node ../vaultspark-studio-ops/scripts/ops.mjs cap "<intent>"` · skills `~/.claude/skills/` (Claude) / `~/.agents/skills/` (Codex) · cheatsheet `vaultspark-studio-ops/docs/SKILL_MAP.md`. Universal skills: `/audit` (9-axis audit → `docs/AUDIT_<date>.md`) + `/implement` (ship the audit). No match → file an innovation candidate.

**Cloudflare questions → live docs, never pre-trained memory (D-S267.1):** the `cloudflare-docs` MCP server (public, no auth) semantically searches CURRENT Cloudflare documentation — limits, pricing tiers, API shapes change under you (the Workers 3MB/10MB gzip caps and free-tier SQLite Durable Objects were both learned the hard way). The `cloudflare:*` skills (wrangler, workers-best-practices, durable-objects, web-perf, turnstile, email) auto-load on matching tasks. Registry entry: `vaultspark-studio-ops/docs/INTERNAL_TOOLS.md` → "Official agent-setup surfaces".

**Before building any tool, check the reuse-registry (CANON-039 · Internal-First):** `vaultspark-studio-ops/docs/INTERNAL_TOOLS.md` is the studio-wide registry of already-built internal tools (arc/guard/propagation/secrets/Ark/doctor and more). Reuse an existing internal tool before researching OSS or building new; only build when the registry has no fit and OSS research comes up short. Record a new reusable tool back to the registry so the next project finds it.

**Frontier capability currency (CANON-049):** at every `/start`, run `node ../vaultspark-studio-ops/scripts/frontier-capability-radar.mjs --refresh-if-stale --write --json` (use the repo-local path inside studio-ops). It checks official OpenAI/ChatGPT/Codex, Anthropic/Claude, and critical-tool sources and refreshes only when the last complete scan exceeds seven days. A failed source stays unknown/degraded. Changed fingerprints create scored review candidates; never silently install, enable a beta, spend API funds, broaden data access, or promise adoption.

**Model currency across surfaces (CANON-049):** Select Claude, OpenAI API, ChatGPT, and Codex models from current official documentation and the model list available in the target runtime; API IDs, subscription product choices, and CLI selectors are separate contracts. Reuse Studio Ops `scripts/lib/model-router.mjs`, `openai-model-catalog.mjs`, and `openai-router.mjs` with their import dependencies. Review project-owned defaults, model menus, allowlists, and pricing when the catalogs change; preserve intentional pins, historical records, provider constraints, and cost gates. Dateless Claude API version IDs are pinned, not evergreen aliases. Use the frontier radar's seven-day refresh guard; failed or stale evidence remains unverified. Never guess an ID, assume entitlement, or introduce paid use to prove currency. Record applied changes and focused checks separately from queued guidance or provider availability.

**Outcome and session scope (S342 founder direction):** Ordinary bounded tasks use Deliver: read the relevant brief, task and creative constraints; run checks needed by the requested action; stop when the requested outcome is verified. Explore and Maintain are explicit scopes, not automatic follow-ups. Budgets are ceilings. Unused tokens, historical velocity, an empty queue, or unrelated maintenance never authorize extra work. Preserve locks, history, credentials, rights, spending and relevant release checks. This supersedes older saturation, token-floor and mandatory-innovation wording. Current SIL scoring is ten categories totaling 1000; older five-category instructions are obsolete. Raw context lists are lookup guides, not mandatory startup reads.

**Media production:** A private production workspace can create public entertainment. Resolve medium independently from audience/access. Use the existing project episode checker through the configured media adapter; missing footage, rights or exact-export review evidence stays nonpassing. A completed proof is not publishing permission. Keep project creative direction and approval separate when sharing render tooling.

**Coordination:** Every work-bearing handoff names the requested outcome, owner, artifact/version, actual dependency and acceptance evidence. Distinguish received, accepted, applied and verified; a transport receipt proves delivery only. Batch nonurgent updates and escalate stalled dependencies when they affect the requested deliverable. Keep shared-file ownership explicit; project creative approval remains local.

## Public-facing project requirements

For `audience: public-*` projects:
- **Sitemap (CANON-011):** every page in `vaultspark-studio-ops/docs/PROJECT_SITEMAP_STANDARD.md` exists + passes bars (LCP <1.8s · CWV green · strict CSP · `/agents.json` · `/.well-known/llms.txt` · sitemap.xml). Score ≥8/10 before SPARKED. Audit: `node ../vaultspark-studio-ops/scripts/check-sitemap-compliance.mjs --project <slug>`.
- **Website scaffold (D-S119.3 · RECOMMENDATION, not a mandate — D-S183.2):** consult `vaultspark-studio-ops/portfolio/STUDIO_WEBSITE_SCAFFOLD/catalog.json` + `patterns.json` as a **recommended starting library** to draw from and elevate per your SOUL — not a strict "only-use-this". Note deviations in DECISIONS so the catalog learns. Make menus/page names/themes/schemas/stack **as project-specific as possible** and keep exploring better options (**CANON-049** — never static). Whatever you start from must clear the elite bar:
  - Start visual implementation from the scaffold's semantic theme layer when useful: `vaultspark-studio-ops/docs/templates/project-system/website-theme-tokens.css` + `patterns.json` theme recipes, then adapt colors/assets to the project's own brand kit.
  - **CANON-041** desktop↔mobile parity + genuinely impressive UI/UX (scrollable 100dvh mobile drawer, never a broken/sticky menu — the pattern is the floor, not the finish).
- **CANON-047** theme toggle (≥ dark + light + optional project themes, each a human-best palette tied to branding) — **AI image-test every theme** (screenshot pages/panels/modals; no black-on-black / light-on-white / sub-WCAG-AA; blocking in `/app-release-gate`).
  - **CANON-053 rendered-pixel working loop (ABSOLUTE whenever UI/UX changes):** use a real browser + image-capable visual tool while implementing, not only at release. Capture before/after (existing surfaces), desktop ≥1280px + mobile ≤430px, every theme and touched state; inspect the images, fix concrete defects, recapture, and leave a hash-bound `docs/visual-qa/LATEST.json` receipt. Source/DOM review alone never counts. Verify with `node ../vaultspark-studio-ops/scripts/check-visual-qa.mjs --project . --changed`.
  - **CANON-048** dual-audience: built for Humans AND AI Agents (`/agents.json` + `/.well-known/llms.txt` + JSON-LD + Obelisk agent auth) + AI-search-first (GEO/AEO alongside SEO).
  - **CANON-045** Obelisk identity plane — public signup/auth wires Obelisk for ONE studio account across every project + human/agent receipts (Vault SSO contract folding into Obelisk; target Obelisk).
- **Enforce (legal/IP complete):** branding line per type (CANON-006), footer `© 2026 VaultSpark Studios LLC. All rights reserved.`, proprietary/all-rights-reserved notice (CANON-008), `/privacy` + `/terms`, acronyms spelled out on first use (CANON-030), free tier cost-neutral (CANON-029), staging before prod (CANON-007). `/app-release-gate` checks these before any SPARKED flip.
- **Contact page + working reply-capable email (D-S194.1 refined by D-S259.2 · MUST · public sites):** every public website ships `/contact` with one address on its own domain. Human mail uses the single **Zoho** organization/mailbox: attach that project address as a send/receive alias to `founder@vaultsparkstudios.com`, configure MX/SPF/DKIM/DMARC, and prove both delivery and reply-as-alias. **Brevo is transactional/app email only**, with authenticated domains and delivery webhooks; Cloudflare/registrar forwarding may remain only until a Zoho alias replacement proves end-to-end delivery. Reachability plus correct reply identity are the gate. Scaffold: `STUDIO_WEBSITE_SCAFFOLD/catalog.json → studioEnforcements.contactRequirement` + `_universal/contact.html.template`.

**Release architecture gates (CANON-007/045 · all deployable/account-bearing projects):** every SPARKED web project has a stable `staging.<owned-project-domain>` origin (or `<slug>.staging.vaultsparkstudios.com` only when it has no owned domain), isolated from production; ephemeral previews are supplementary. Every project declares `obeliskArchitecture: internal | external | hybrid`, and every applicable sign-in/create-account/invitation/recovery/session/logout flow delegates identity to Obelisk. At `/start`, run Canon/Ark reconciliation and surface these gaps; never replace an Obelisk gap with project-local auth.

## Actively CHECK canon — don't just point at it (S183 founder directive)

Referencing the index below is not enough — **every project actively checks Studio Canon and records its posture.** At `/initiate` (mandatory) and on `/start`, run:
```bash
node ../vaultspark-studio-ops/scripts/start-canon-sync.mjs --project . --slug <current-repo-slug> --json
node ../vaultspark-studio-ops/scripts/check-canon-adoption.mjs --project . --write    # initiate / refresh
node ../vaultspark-studio-ops/scripts/check-canon-adoption.mjs --project . --suggest  # start (pre-fill safe conformance-backed suggestions)
node ../vaultspark-studio-ops/scripts/check-canon-adoption.mjs --project . --check    # start (verify current)
```
It reads the **live** `STUDIO_CANON.md` (always current) and maintains `context/CANON_ADOPTION.md` — each ACTIVE canon marked adopted / pending / review / exempt-with-reason. `--suggest` may pre-fill `adopted (suggested)` only from conformance/doctor evidence; judgment canon remain `review`. Walk the remaining `review` rows for your type. A missing/stale adoption file is a doctor finding (`canon-adoption-active`). The canon index below is the *map*; `CANON_ADOPTION.md` is your *checked posture against it*.

---
