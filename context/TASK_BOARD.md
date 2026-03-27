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

## In Progress

- None

---

## Completed (2026-03-26 audit pass)

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

## Queued (AI can execute next session)

- [ ] Wire `replayStore.startRecording()` / `recordIntent()` / `finishRecording()` into Worker.ts turn loop
- [ ] Expose `GET /api/replay/:id` and `GET /api/replays` routes on Worker.ts
- [ ] Wire `spectatorBus.broadcast()` into Worker.ts turn fan-out; add `GET /spectate/:gameId` WebSocket route
- [ ] Mount SpectatorRunner in ClientGameRunner (add `?spectate` URL flag)
- [ ] Add `GET /api/map-editor/preview` to Worker.ts (POST JSON → Go binary → PNG)
- [ ] Register `<map-editor>` custom element in Main.ts and add nav link (dev/admin only)
- [ ] Add integration test: mock runtime API + test client initialization flow
- [ ] Add Vitest viewport tests at 320px / 768px / 1920px breakpoints
- [ ] Extract `VaultRewardCalculator` class from `VaultFrontExecution.ts`
- [ ] Extract `VaultRouteRiskScorer` class from `VaultFrontExecution.ts`
- [ ] Add keyboard shortcut system to VaultFront HUD

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
- Light theme implementation (brand abstraction exists, styling not complete)
- Competitive theme variant (defined in BrandTheme, not integrated)
- Storybook / design system documentation
