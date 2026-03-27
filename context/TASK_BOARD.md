# Task Board

Date: 2026-03-26

---

## Completed

- Converted VaultFront GitHub Pages to the repo-local launch-stub model
- Restored `https://vaultsparkstudios.com/vaultfront/` with HTTPS-backed stub
- Migrated VaultFront to treat `VaultSparkStudios/vaultfront` as the canonical
  remote and `origin`
- Ported and pushed the gameplay/HUD clarity and tuning pass onto
  `vaultfront/main`
- Diagnosed and fixed the failing GitHub `CI` checks on `main`
- Excluded `.codex-temp-*` worktrees from Vitest and `.gitignore`
- Added `docs/VAULTFRONT_SOURCE_MAP.md` (39 files catalogued)
- Added `docs/GAMEPLAY_DESIGN.md` (full mechanics + reward formula reference)
- Expanded `docs/Architecture.md` with VaultFront module map and data flows
- Added VaultFront section to `CONTRIBUTING.md`
- Added `.github/CODEOWNERS` for VaultFront-owned files and CI
- Consolidated session state into `context/` (removed `handoffs/` and `logs/`)
- Updated `AGENTS.md` with source map read order and session context table
- Added `tests/core/execution/VaultFrontLifecycle.test.ts` (4 integration tests,
  82/82 files, 623/623 tests green)

---

## Completed (2026-03-26 audit pass — session 1)

- [x] Full project audit (7.8/10 scored, 20 improvement items identified)
- [x] Repo cleanup: screenshots deleted, handoffs moved to context/, AGENTS.md updated
- [x] Coverage thresholds enforced (vite.config.ts)
- [x] `no-explicit-any` scoped to VaultFront-owned files (eslint.config.js)
- [x] Semantic release config + workflow
- [x] Canary promotion workflow (promote.yml)
- [x] Bundle size budget (.bundlewatch.json + CI job)
- [x] OpenAPI spec written (docs/api/openapi.yaml)
- [x] Deploy Runtime runbook (docs/DEPLOY_RUNTIME_RUNBOOK.md)
- [x] PWA: manifest.json enriched + sw.ts service worker + Main.ts registration
- [x] Weekly mutator dashboard (pages-stub/index.html)
- [x] Discord notifier (src/server/DiscordNotifier.ts)
- [x] Light theme: CSS tokens + BrandTheme + SettingsModal + UserSettings
- [x] Bot difficulty hint (SinglePlayerModal)
- [x] en.json: brand_theme_light key added
- [x] Replay system scaffolded (ReplayStore.ts + ReplayPlayer.ts)
- [x] Spectator mode scaffolded (SpectatorBus.ts + SpectatorRunner.ts)
- [x] Map editor scaffolded (MapEditor.ts full Lit component)
- [x] Playwright E2E tests: 3 specs + config + e2e.yml CI workflow

---

## Completed (2026-03-26 audit pass — session 2, all 25 brainstorm items actioned)

- [x] [SIL-1] SOUL.md rewritten with specific mechanics and audience (context/SOUL.md)
- [x] [SIL-2] PROJECT_BRIEF.md rewritten with real pitch + success criteria (context/PROJECT_BRIEF.md)
- [x] [SIL-3] Dependency security audit job added to CI (ci.yml security-audit job)
- [x] [SIL-4] Content Security Policy headers added to nginx.conf
- [x] [SIL-5] X-Content-Type-Options + X-Frame-Options + Referrer-Policy added to nginx.conf
- [x] [SIL-6] NewsModal news button made visible (removed `hidden` class)
- [x] [SIL-7] Replay system wired end-to-end: - ReplayStore.recordTurn() method added - GameServer.ts hooks: startRecording on prestart, recordTurn on endTurn, finishRecording on end - Worker.ts: GET /api/replay/:id and GET /api/replays routes
- [x] [SIL-8] Spectator WebSocket route wired: - WorkerLobbyService.ts: /spectate/:gameId upgrade handler - Worker.ts: spectatorBus.join() connection handler
- [x] [SIL-9] Execution chain combo meter + surge badge + squad objective ring added to VaultFrontLayer - VaultFrontStatusUpdate extended with executionChain, surge, squadObjective fields - VaultFrontExecution.ts publishes new fields - VaultFrontLayer.ts renders combo meter (3 nodes + timer arc), surge badge, squad ring
- [x] [SIL-10] Weekly mutator announcement banner rendered in VaultFrontLayer on first status tick
- [x] [SIL-11] Bot AI improved: gold-gated jam_breaker, strength-aware escort, phase-aware reroute
- [x] [SIL-12] First-run tutorial overlay (VaultFrontTutorial.ts) — 5-step contextual Lit component
- [x] [SIL-13] Light theme completion (CSS tokens applied to all VaultFront-owned components)
      (moved from Deferred — tokens exist, completing the pass)

---

## In Progress

- None

---

## Queued (AI can execute next session)

### From audit brainstorm — medium effort

- [ ] [SIL-14] Extract `VaultRewardCalculator` class from `VaultFrontExecution.ts`
- [ ] [SIL-15] Extract `VaultRouteRiskScorer` class from `VaultFrontExecution.ts`
- [ ] [SIL-16] Add keyboard shortcut system (E=escort, J=jam, R=reroute_safest, Tab=cycle vaults)
- [ ] [SIL-17] Wire `<map-editor>` nav link + `GET /api/map-editor/preview` route (dev/admin only)
- [ ] [SIL-18] Visual regression tests (Playwright snapshot: empty map, vault active, convoy, surge, chain)
- [ ] [SIL-19] Competitive theme variant — apply to all VaultFront-owned components
- [ ] [SIL-20] Map variety expansion — define 5–8 named VaultFront map configs in MapPlaylist.ts
- [ ] [SIL-21] In-game Discord feed — extend DiscordNotifier for weekly mutator + milestone events
- [ ] [SIL-22] Add Vitest viewport tests at 320px / 768px / 1920px breakpoints
- [ ] [SIL-23] Add integration test: mock runtime API + test client initialization flow

### From original queued list (carried forward)

- [ ] Wire `replayStore.startRecording()` / `recordIntent()` / `finishRecording()` into Worker.ts turn loop
- [ ] Expose `GET /api/replay/:id` and `GET /api/replays` routes on Worker.ts
- [ ] Wire `spectatorBus.broadcast()` into Worker.ts turn fan-out; add `GET /spectate/:gameId` WebSocket route
- [ ] Mount SpectatorRunner in ClientGameRunner (add `?spectate` URL flag)
- [ ] Add `GET /api/map-editor/preview` to Worker.ts (POST JSON → Go binary → PNG)
- [ ] Register `<map-editor>` custom element in Main.ts and add nav link (dev/admin only)

### Post-deployment (requires live runtime — Hetzner VPS + DNS)

- [ ] [SIL-24] OpenTelemetry player events → Grafana dashboard
      (vault_captured, convoy_delivered, execution_chain_completed, surge_activated)
- [ ] [SIL-25] Player match history + vault stats persistence (Postgres)
- [ ] [SIL-26] Persistent global leaderboard (ELO/points, weekly/alltime tabs)

### Architecture — high effort, do before next major feature wave

- [ ] [SIL-27] Split GameServer.ts (49KB) into GameHandler + LobbyHandler + BroadcastHandler
- [ ] [SIL-28] Split Worker.ts into WorkerRoutes + WorkerExperiments + WorkerTelemetry modules
      Note: do before spectator and replay wiring to avoid compounding monolith complexity.

---

## MANUAL — Requires human action outside the repo

These tasks are flagged as manual. They cannot be executed by an AI session.
Do not attempt to automate or stub these without explicit confirmation.

### 0. Install deferred dev dependencies

**Action:** Run this once from the project root:

```bash
npm install --save-dev @playwright/test bundlewatch \
  @semantic-release/commit-analyzer @semantic-release/release-notes-generator \
  @semantic-release/changelog @semantic-release/github
npx playwright install chromium
```

**Why:** Three new CI/tooling features (E2E tests, bundle budget, semantic release)
were configured in code during the 2026-03-26 session but their packages were not
installed to avoid modifying `package-lock.json` without running `npm ci` first.
**Impact:** Until installed, `npm run e2e`, `npx bundlewatch`, and
`npx semantic-release` will fail locally. CI workflows will also fail on first run.
**Status:** ⏳ Pending

---

### 1. Rename local development folder

**Action:** Rename `documents/development/OpenFrontIO` → `documents/development/VaultFront`
**Why:** Folder name refers to the upstream source, not this project. All other
VaultSpark projects in `development/` use their game name as the folder name.
**Impact:** Git repo is unaffected. Update any open terminals, IDE workspace
files, or shortcuts pointing to the old path. Claude Code memory path will
update automatically on next session start from the new folder.
**Status:** ⏳ Pending

### 2. Provision Hetzner VPS

**Action:** Provision a VPS (4 vCPU / 8 GB RAM / 100 GB SSD recommended).
Install Docker, Docker Compose, and Caddy/Traefik. Open ports 80 and 443.
**Why:** The entire backend runtime is blocked on a live host. `build.sh`,
`deploy.sh`, and `update.sh` are ready to run — they just need a target server.
**Status:** ⏳ Pending

### 3. Configure GitHub Actions secrets

**Action:** In the `VaultSparkStudios/vaultfront` repo settings, add:

- `DEPLOY_SERVER_HOST` — VPS IP or hostname
- `DEPLOY_SSH_KEY` — private SSH key for the deploy user
- `GHCR_TOKEN` — GitHub Container Registry token (write scope)
- `API_KEY` — game API key
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret
- `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_AUTH_HEADER` — if using observability
  **Why:** `deploy.yml` reads these secrets. Without them CI will fail when the
  Deploy workflow is triggered.
  **Status:** ⏳ Pending

### 4. Configure GitHub Actions vars

**Action:** In repo settings → Variables, add:

- `DOMAIN` — `vaultsparkstudios.com`
- `GHCR_USERNAME` — VaultSparkStudios
- `GHCR_REPO` — vaultfront
- `DEPLOY_REMOTE_USER` — deploy user on VPS (e.g. `vaultfront`)
  **Status:** ⏳ Pending

### 5. Set up Postgres and Redis on VPS

**Action:** Create a `vaultfront` database in Postgres and a `vaultfront`
Redis instance. Configure connection strings in the environment file used by
`update.sh`.
**Status:** ⏳ Pending

### 6. Configure DNS records

**Action:** Add DNS A records:

- `play-vaultfront.vaultsparkstudios.com` → VPS IP
- `api-vaultfront.vaultsparkstudios.com` → VPS IP
  Let Traefik handle TLS via Let's Encrypt (already labelled in `update.sh`).
  **Status:** ⏳ Pending

### 7. Run first deploy and verify

**Action:** Trigger the `Deploy` workflow from GitHub Actions with
`target_environment: production`, `target_host: primary`, `target_subdomain: play-vaultfront`.
Then verify:

- `https://play-vaultfront.vaultsparkstudios.com/commit.txt` returns the SHA
- WebSocket connection from public client succeeds
- CORS headers are correct
- `/health` endpoint returns 200
  **Status:** ⏳ Pending (depends on steps 2–6)

### 8. Swap Pages workflow to publish real client

**Action:** Once step 7 is verified, update `deploy-pages.yml` to publish
the real client bundle instead of `pages-stub/`. Trigger the workflow manually.
**Status:** ⏳ Pending (depends on step 7)

---

## Deferred (indefinitely)

- Any attempt to use `openfront-upstream/main` as the day-to-day publish branch
- Storybook / design system documentation
