# Current State

Date: 2026-03-27 (session 4 closeout)

---

## Canonical repo state

- Repo of record: `VaultSparkStudios/vaultfront`
- Local branch: `main`
- Upstream tracking: `origin/main`
- Canonical remote:
  - `origin -> https://github.com/VaultSparkStudios/vaultfront.git`
- Reference remote (read-only, upstream sync source):
  - `openfront-upstream -> https://github.com/openfrontio/OpenFrontIO.git`
- Archived local branch (do not use for new work):
  - `openfront-main-archive-2026-03-12`
- Local folder: `documents/development/OpenFrontIO`
  - ⚠️ MANUAL PENDING: rename to `documents/development/VaultFront`

---

## Public deployment state

- Public project URL: `https://vaultsparkstudios.com/vaultfront/`
- Current public behavior: repo-local GitHub Pages launch stub is live over HTTPS
- Runtime targets reserved but not yet launched:
  - `https://play-vaultfront.vaultsparkstudios.com` ⚠️ MANUAL PENDING
  - `https://api-vaultfront.vaultsparkstudios.com` ⚠️ MANUAL PENDING

---

## Most recent shipped changes

- 2026-03-27 Full audit (7.6/10) — session 4 audit-only pass; no new code shipped

  New findings (critical gaps discovered):

  - PlayerStatsStore Postgres path is a stub — `pg` package not in deps; all data in-memory
  - AchievementStore also in-memory only (state lost on restart)
  - VaultMetrics counters initialized but zero recording calls exist in GameServer
  - VaultSeasonScheduler vote results also in-memory
  - Only 4 E2E specs covering an entire game
  - No Docker Compose for local infra
  - No database migration CI job

  25-item brainstorm (B-1 through B-25) added to TASK_BOARD.md.
  Next session priority: B-1 (wire Postgres) → B-2 (wire VaultMetrics) → B-3 (Docker Compose).

- 2026-03-27 Full audit (7.5/10) + 10-item implementation pass (session 3)

  Highest Leverage (Low Effort):

  - @playwright/test added to package.json (E2E CI now functional after `npm install`)
  - pages-stub/index.html: full landing page rewrite — 6 mechanics, Play Now CTA, How to Play
  - DiscordNotifier.ts: surgeActivated, squadObjectiveCompleted, convoyMilestoneReached added
  - .renovaterc.json: Renovate bot config created (grouped auto-PRs by dep type)

  Highest Ceiling (High Effort):

  - src/server/db/schema.sql: Postgres tables (player_stats, match_history, leaderboard_cache)
  - src/server/EloRating.ts: pure Elo utility (calculate, expectedScore, ratingLabel)
  - src/server/PlayerStatsStore.ts: match history + Elo persistence (in-memory, Postgres-ready)
  - Worker.ts: GET /api/player/history/:id, GET /api/leaderboard, GET /api/player/stats/:id
  - src/client/HistoryModal.ts: Lit component — match history tab + leaderboard tab
  - src/server/VaultMetrics.ts: 7 OTel counters (vault_captured, convoy_delivered, etc.)
  - WorkerMetrics.ts + GameServer.ts: VaultMetrics wired on match start/end
  - docs/grafana-dashboard.json: importable Grafana 10.x dashboard template
  - src/server/AchievementStore.ts: 15 achievement definitions + in-memory tracker
  - src/client/AchievementToast.ts: Lit component — queued toast with slide+fade animation
  - DiscordNotifier.ts: achievementUnlocked, weeklyMutatorAnnounced, weeklyVoteOpened, voteResultPosted
  - src/server/VaultSeasonScheduler.ts: weekly mutator rotation + Discord community voting
  - Worker.ts: GET /api/season/current + vaultSeasonScheduler.start() wired
  - docs/VAULTFRONT_SOURCE_MAP.md: 4 new VaultFront-owned files registered

- 2026-03-26 Full audit + 25-item implementation pass (session 2)

  - SOUL.md + PROJECT_BRIEF.md rewritten with real substance (context/)
  - CI: security-audit job (npm audit --audit-level=high)
  - nginx.conf: CSP + X-Content-Type-Options + X-Frame-Options + Referrer-Policy
  - NewsModal news button made visible (removed hidden class)
  - Replay system wired: ReplayStore.recordTurn(), GameServer hooks, Worker.ts API routes (/api/replay/:id, /api/replays)
  - Spectator WebSocket: WorkerLobbyService upgrade handler + spectatorBus wired into GameServer turn fan-out
  - VaultFrontStatusUpdate extended: executionChains, surges, squadObjectives fields
  - VaultFrontExecution.ts publishes all new fields
  - VaultFrontLayer.ts: execution chain combo meter, surge badge, squad ring, mutator banner
  - NationExecution.ts bot AI: gold-gated jam_breaker, strength-aware escort, tighter timing
  - VaultFrontTutorial.ts: first-run 5-step tutorial overlay (registered in Main.ts)
  - VAULTFRONT_SOURCE_MAP.md updated with VaultFrontTutorial.ts
  - DECISIONS.md: 3 new architectural decisions recorded
  - 623/623 tests passing (NationExecution tests updated to match new behavior)

- 2026-03-26 Full audit + top-20 improvement pass (session 1)
  - Coverage thresholds enforced in vite.config.ts (70% lines/functions, 60% branches)
  - `no-explicit-any` scoped to VaultFront-owned files in eslint.config.js
  - Semantic release workflow + .releaserc.json added
  - Canary promotion workflow (promote.yml) added
  - Bundle size budget (.bundlewatch.json + CI job) added
  - OpenAPI spec written (docs/api/openapi.yaml)
  - Deploy Runtime runbook written (docs/DEPLOY_RUNTIME_RUNBOOK.md)
  - PWA: manifest.json enriched, service worker (sw.ts) + Main.ts registration
  - Weekly mutator dashboard added to pages-stub/index.html
  - Discord notifier added (src/server/DiscordNotifier.ts)
  - TODO warning rule added to ESLint for VaultFront-owned files
  - Light theme wired: CSS custom properties in index.html, BrandTheme.ts, SettingsModal.ts, UserSettings.ts
  - Bot difficulty hint added to SinglePlayerModal
  - `brand_theme_light` added to en.json
  - Replay system scaffolded (ReplayStore.ts + ReplayPlayer.ts)
  - Spectator mode scaffolded (SpectatorBus.ts + SpectatorRunner.ts)
  - Map editor scaffolded (MapEditor.ts)
  - Playwright E2E tests: homepage, settings, single-player (3 spec files + config)
  - E2E CI workflow added (.github/workflows/e2e.yml)
  - VAULTFRONT_SOURCE_MAP.md updated with all new files
- `8f53f309` repo organization, docs, CODEOWNERS, lifecycle integration tests
- `01461146` fixed GitHub CI failures on `main`
- `88a9e04b` excluded local `.codex-temp-*` worktrees from tooling

---

## Validation status

- 82/82 test files, 623/623 tests green (session 2 — last verified 2026-03-26)
- E2E: @playwright/test now in package.json — run `npm install` then E2E will function
- GitHub Actions `CI` last passed on `88a9e04b`
- `main` is ahead of `origin/main` — commits from sessions 1, 2, and 3 not yet pushed

---

## Manual blockers — deployment

All of the following require human action outside this repo.
See `context/TASK_BOARD.md` → MANUAL section for full detail.

| #   | Task                                             | Status     |
| --- | ------------------------------------------------ | ---------- |
| 1   | Rename local folder `OpenFrontIO` → `VaultFront` | ⏳ Pending |
| 2   | Provision Hetzner VPS                            | ⏳ Pending |
| 3   | Configure GitHub Actions secrets                 | ⏳ Pending |
| 4   | Configure GitHub Actions vars                    | ⏳ Pending |
| 5   | Set up Postgres + Redis on VPS                   | ⏳ Pending |
| 6   | Configure DNS records                            | ⏳ Pending |
| 7   | Run first deploy and verify                      | ⏳ Pending |
| 8   | Swap Pages workflow to real client bundle        | ⏳ Pending |

---

## Open constraints

- Public site is a stub — not the playable client
- Backend/runtime rollout has not started; blocked entirely on manual steps
- `openfront-main-archive-2026-03-12` is local-only by design
- `8f53f309` is committed locally but not yet pushed to `origin/main`
