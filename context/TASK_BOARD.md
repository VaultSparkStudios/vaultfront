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

## Queued (AI can execute next session)

- [ ] Add OpenAPI spec for backend endpoints (`docs/API.md`)
- [ ] Add integration test: mock runtime API + test client initialization flow
- [ ] Add Vitest viewport tests at 320px / 768px / 1920px breakpoints
- [ ] Extract `VaultRewardCalculator` class from `VaultFrontExecution.ts`
- [ ] Extract `VaultRouteRiskScorer` class from `VaultFrontExecution.ts`
- [ ] Centralize brand constants into `src/client/BrandTokens.ts`
- [ ] Add keyboard shortcut system to VaultFront HUD
- [ ] Add `manifest.json` + service worker for PWA installability
- [ ] Configure Vitest coverage thresholds (75% overall, 85% core execution)

---

## MANUAL — Requires human action outside the repo

These tasks are flagged as manual. They cannot be executed by an AI session.
Do not attempt to automate or stub these without explicit confirmation.

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
