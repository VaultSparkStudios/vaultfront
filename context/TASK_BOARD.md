# Task Board

Date: 2026-03-27

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
- [x] [SIL-7] Replay system wired end-to-end: ReplayStore.recordTurn(), GameServer hooks, Worker.ts routes
- [x] [SIL-8] Spectator WebSocket route wired: WorkerLobbyService upgrade handler + spectatorBus
- [x] [SIL-9] Execution chain combo meter + surge badge + squad objective ring added to VaultFrontLayer
- [x] [SIL-10] Weekly mutator announcement banner rendered in VaultFrontLayer
- [x] [SIL-11] Bot AI improved: gold-gated jam_breaker, strength-aware escort, phase-aware reroute
- [x] [SIL-12] First-run tutorial overlay (VaultFrontTutorial.ts) — 5-step contextual Lit component
- [x] [SIL-13] Light theme completion (CSS tokens applied to all VaultFront-owned components)

---

## Completed (2026-03-27 audit pass — session 3, Highest Leverage + Highest Ceiling items)

### Highest Leverage (Low Effort)

- [x] [I-2] Fix E2E in CI — @playwright/test added to package.json devDependencies
      ⚠️ MANUAL: user must run `npm install` once to update package-lock.json
- [x] [C-1] Real launch landing page — pages-stub/index.html rewritten with all 6
      mechanics, feature cards, Play Now CTA, How to Play section, and mechanic callouts
- [x] [C-2] Discord in-game feed — DiscordNotifier.ts extended with:
      surgeActivated, weeklyMutatorAnnounced, squadObjectiveCompleted, convoyMilestoneReached
- [x] [D-3] Renovate bot — .renovaterc.json created (auto-PRs grouped by dep type)

### Highest Ceiling (High Effort)

- [x] [G-3/G-4] Match history + global leaderboard: - src/server/db/schema.sql — Postgres tables (player_stats, match_history, leaderboard_cache) - src/server/PlayerStatsStore.ts — persistence + Elo calculation - Worker.ts routes: GET /api/player/history/:id, GET /api/leaderboard, POST /api/player/match - Client: leaderboard modal enhanced with History tab
- [x] [C-5] Player rating system (Elo/Glicko2) — EloRating utility integrated into PlayerStatsStore
- [x] [D-1] OTel player events → Grafana: - src/server/VaultMetrics.ts — counters: vault_captured, convoy_delivered,
      execution_chain_completed, surge_activated, match_started, match_ended - docs/grafana-dashboard.json — importable Grafana dashboard template
- [x] [G-8] Achievement system: - src/server/AchievementStore.ts — 15 achievement definitions + per-player tracker - src/client/AchievementToast.ts — Lit component for unlock notification - Discord notification wired for achievement unlocks
- [x] [D-6] Seasonal map rotations + Discord community voting: - src/server/VaultSeasonScheduler.ts — weekly rotation schedule + Discord voting - DiscordNotifier extended: weeklyVoteAnnounced, voteResultPosted - GET /api/season/current endpoint

---

## In Progress

- None

---

## Queued — Session 4 brainstorm (B-items, highest priority first)

### CRITICAL — do before any new feature work

- [x] [B-1] Wire Postgres: install `pg` dep, implement connection pool, migrate PlayerStatsStore +
      AchievementStore + VaultSeasonScheduler from in-memory to real SQL queries.
      Swap leaderboard cache to Postgres materialized view.
      ⚠️ MANUAL PREREQUISITE: step 5 (Postgres on VPS) must be done first for prod;
      local dev can use docker-compose (B-3) or a local pg instance.
- [x] [B-2] Wire VaultMetrics recording calls: add VaultMetrics.record\*() callsites to the
      6–7 event sites in GameServer.ts (vault capture, convoy delivery, chain completed,
      surge activated, match start/end, achievement unlock). ~20 lines total.
- [x] [B-3] Docker Compose for local infra: single docker-compose.yml spinning Postgres +
      Redis + app. Reduces onboarding to one command. Prerequisite for testing B-1 locally.

### Low effort, real impact

- [ ] [B-7] Match invite deep links (OG-preview): /join?code=XYZ + dynamic Open Graph meta
      per lobby (map, player count, mode). One-click share from Discord/Twitter.
- [ ] [B-14] Revenge queue / rematch button: after game end, one-click creates direct lobby
      invite to all players from the previous match.
- [ ] [B-21] CodeQL + Semgrep SAST: add static analysis CI job to ci.yml. (= D-2, elevated)
- [ ] [B-23] Automated upstream sync PR: weekly GH Actions job fetches openfront-upstream/main,
      rebases VaultFront-owned files, opens draft PR with conflict list.
- [ ] [B-24] Contributing guide + issue templates: CONTRIBUTING.md dev setup + PR checklist +
      GitHub issue templates (bug / feature / balance). (= D-4, elevated)

### Medium effort, high impact

- [ ] [B-4] Database migration CI job: apply schema.sql against a test Postgres container in CI
      and verify all tables create cleanly. Catches schema drift before it hits production.
- [ ] [B-5] Perf regression gate in CI: Vitest bench tests, fail if turn-processing regresses >10%.
- [ ] [B-6] Full Discord bot (slash commands): /leaderboard, /stats @player, /join, /season.
      Rich embeds with Elo badges. Upgrade from fire-and-forget webhooks.
- [ ] [B-9] Live spectator public URL + game browser: /spectate page listing live public games;
      one-click read-only WebSocket view. SpectatorBus already wired, needs browser UI.
- [ ] [B-10] PWA push notifications (after B-1): Web Push subscription flow — convoy arrived /
      vault captured / match invite. Drives re-engagement. sw.ts already registered.
- [ ] [B-11] Season pass + rank decay: season_number column in player_stats, soft-reset Elo 50%
      each season (8–12 weeks), cosmetic badge for peak rank. Recurring re-engagement loop.
- [ ] [B-15] HUD skin cosmetics: VaultFront-branded HUD color packs (gold, crimson, neon).
      Unlocked via achievements or season pass. Zero pay-to-win.
- [ ] [B-16] Keyboard shortcut system: E=escort, J=jam, R=reroute, Tab=cycle vaults. Keybind
      config screen. (= G-1, elevated with keybind screen addition)
- [ ] [B-17] Map playlist + balance scoring CI: 3–5 VaultFront maps (= G-5) + CI job that runs
      static balance heuristic on maps and fails below threshold.
- [ ] [B-22] Live admin balance dashboard: Grafana panel — avg vault capture time, convoy rate,
      chain frequency, Elo distribution. Requires B-1 + B-2 + OTel endpoint live.

### High effort, transformative

- [ ] [B-25] AI post-match recap (Claude API): after game end, server calls Claude with match
      stats → 3-sentence personalized coach recap shown in WinModal. Industry-first
      differentiator; viral moment driver.
- [ ] [B-8] Replay shareable highlight clips: server-side job identifies top 30s of replay
      (peak chain combo / most vault captures) and renders as shareable GIF/clip.
      Content marketing flywheel — every match generates social content.
- [ ] [B-12] Clan / Squad system: persistent team of 2–8, clan leaderboard, clan tag in HUD,
      Discord role auto-assignment via bot. Strongest retention mechanic in multiplayer.
- [ ] [B-13] Tournament bracket system: 8/16-player single-elimination. Organizer creates bracket,
      players self-register, auto-advances winners. Discord #tournament integration.
- [ ] [B-18] Tutorial bot matches: scripted 3-min solo match against AI with contextual speech
      bubbles explaining mechanics. Full onboarding game experience (vs 5-step overlay).
- [ ] [B-19] Anti-cheat: server-side input validation — flag statistically implausible move
      sequences, log flagged sessions, auto-ban on 3 strikes. Essential before ranked play.
- [ ] [B-20] WebRTC in-game voice chat: auto-create squad voice room on game start (STUN/SFU).
      In-game comms for squad objectives. Major coordination differentiator.

---

## Queued (AI can execute next session) — carry-forward

### Infrastructure & Deployment

- [ ] [I-1] MANUAL: Ship deployment (8-step runbook — Hetzner VPS provisioning)
      Note: highest-impact item. Unblocks Momentum + Deployment categories.
- [ ] [I-3] Add `npm run perf` to ci.yml with fail-on-regression gate
- [ ] [I-4] Script Caddyfile template into deploy runbook (removes 2 of 8 manual steps)
- [ ] [I-5] Docker Compose for local infra (Postgres + Redis + app in one command) — see B-3

### Testing & Quality

- [ ] [T-1] Visual regression tests (was SIL-18): Playwright snapshots for VaultFrontLayer HUD states
- [ ] [T-2] Extract VaultRewardCalculator (was SIL-14): pull reward math out of VaultFrontExecution.ts
- [ ] [T-3] Extract VaultRouteRiskScorer (was SIL-15): pull route risk scoring out of VaultFrontExecution.ts
- [ ] [T-4] Spectator WebSocket integration test: spin up test game, assert state sync
- [ ] [T-5] Replay determinism fuzz test: random seeds → assert identical output
- [ ] [T-6] Mutation testing (Stryker) on VaultFrontExecution.ts

### Game Features

- [ ] [G-1] Keyboard shortcut system (was SIL-16): E=escort, J=jam, R=reroute, Tab=cycle vaults
- [ ] [G-2] MapEditor API wire-up (was SIL-17): nav link + GET /api/map-editor/preview route
- [ ] [G-5] MapPlaylist expansion (was SIL-20): 3–5 VaultFront-specific map configs
- [ ] [G-6] Competitive theme variant (was SIL-19): dark/high-contrast theme for all VaultFront components
- [ ] [G-7] Weekly mutator rotation scheduler: automate mutator rotation via cron/config push
- [ ] [G-9] PWA push notifications: convoy arrived / vault site ready via sw.ts

### Community & Identity

- [ ] [C-3] Replay share permalinks: share button → /api/replay/:id URL
- [ ] [C-4] Match invite links: "Play with me" URL pre-filling lobby join code

### Developer Experience

- [ ] [D-2] CodeQL / Semgrep SAST: add static analysis job to ci.yml
- [ ] [D-4] Contributing guide + GitHub issue templates (bug / feature / balance)

### Architecture (do before next major feature wave)

- [ ] [SIL-27] Split GameServer.ts (49KB) → GameHandler + LobbyHandler + BroadcastHandler
- [ ] [SIL-28] Split Worker.ts → WorkerRoutes + WorkerExperiments + WorkerTelemetry

### Medium-effort carried from session 2

- [ ] [SIL-22] Add Vitest viewport tests at 320px / 768px / 1920px breakpoints
- [ ] [SIL-23] Add integration test: mock runtime API + test client initialization flow
- [ ] Wire `replayStore` and `spectatorBus` into remaining Worker.ts turn loop hooks
- [ ] Mount SpectatorRunner in ClientGameRunner (add `?spectate` URL flag)

### Post-deployment (requires live runtime — Hetzner VPS + DNS)

- [ ] [SIL-24] OTel player events → Grafana live (VaultMetrics.ts is ready; just needs endpoint)
- [ ] [SIL-25] Player match history live (PlayerStatsStore.ts ready; needs Postgres connection)
- [ ] [SIL-26] Global leaderboard live (same as above)

---

## MANUAL — Requires human action outside the repo

### 0. Install deferred dev dependencies

**Action:** Run once from the project root:

```bash
npm install --save-dev @playwright/test bundlewatch \
  @semantic-release/commit-analyzer @semantic-release/release-notes-generator \
  @semantic-release/changelog @semantic-release/github
npx playwright install chromium
```

**Status:** ⏳ Pending

---

### 1. Rename local development folder

**Action:** Rename `documents/development/OpenFrontIO` → `documents/development/VaultFront`
**Status:** ⏳ Pending

### 2. Provision Hetzner VPS

**Action:** CX32 (4 vCPU / 8 GB RAM). Install Docker + Caddy + Postgres + Redis. Open 80/443.
**Status:** ⏳ Pending

### 3. Configure GitHub Actions secrets

Add: `DEPLOY_SERVER_HOST`, `DEPLOY_SSH_KEY`, `GHCR_TOKEN`, `API_KEY`,
`TURNSTILE_SECRET_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_AUTH_HEADER`
**Status:** ⏳ Pending

### 4. Configure GitHub Actions vars

Add: `DOMAIN`, `GHCR_USERNAME`, `GHCR_REPO`, `DEPLOY_REMOTE_USER`
**Status:** ⏳ Pending

### 5. Set up Postgres and Redis on VPS

Create `vaultfront` database + `vaultfront` Redis instance. Run `db/schema.sql`.
**Status:** ⏳ Pending

### 6. Configure DNS records

- `play-vaultfront.vaultsparkstudios.com` → VPS IP
- `api-vaultfront.vaultsparkstudios.com` → VPS IP
  **Status:** ⏳ Pending

### 7. Run first deploy and verify

Trigger `Deploy` workflow → verify `/commit.txt`, WebSocket, CORS, `/health`.
**Status:** ⏳ Pending (depends on steps 2–6)

### 8. Swap Pages workflow to real client

Update `deploy-pages.yml` to publish real client bundle instead of `pages-stub/`.
**Status:** ⏳ Pending (depends on step 7)

---

## Deferred (indefinitely)

- [D-5] Admin balance dashboard — very high effort; requires design + auth for production
- Any attempt to use `openfront-upstream/main` as the day-to-day publish branch
- Storybook / design system documentation
