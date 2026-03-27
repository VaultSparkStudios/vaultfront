# Latest Handoff

Date: 2026-03-27 (session 4 — audit + closeout)

---

## Session summary — 2026-03-27 (session 4)

Audit-only pass. No new features shipped. Full codebase re-audit discovered critical
production gaps in session-3 work. 25-item brainstorm (B-items) added to task board.

### Audit results

- Overall: **7.6 / 10** (up from 7.5 session 3 baseline)
- Biggest drags: Deployment 3.0, Momentum 5.0 (nothing live), Tests 7.0 (4 E2E specs only)
- Biggest improvements this session: Identity/Brand 7.0 (↑0.5 — real landing page)

### Critical gaps discovered (NEW — not previously known)

1. **`pg` package missing from dependencies** — Postgres cannot connect; root cause of gaps 2–4
2. **PlayerStatsStore Postgres path is a stub** — `DATABASE_URL` detected but no queries run;
   all player stats / match history / leaderboard data is in-memory and lost on restart
3. **AchievementStore in-memory only** — same pattern; achievements lost on restart
4. **VaultMetrics recording calls absent** — 7 OTel counters defined but zero `.record*()` calls
   exist anywhere in GameServer.ts; the Grafana dashboard would show nothing if deployed
5. **VaultSeasonScheduler vote results in-memory** — lost on restart
6. **No Docker Compose** — local multi-service dev requires manual Postgres + Redis setup

### Items flagged as MANUAL (human action required — see TASK_BOARD.md)

| #   | Task                                                                        | Status     |
| --- | --------------------------------------------------------------------------- | ---------- |
| 0   | Install `npm install --save-dev @playwright/test` + playwright browsers     | ⏳ Pending |
| 1   | Rename local folder `OpenFrontIO` → `VaultFront`                            | ⏳ Pending |
| 2   | Provision Hetzner VPS (CX32 — Docker + Caddy + Postgres + Redis)            | ⏳ Pending |
| 3   | Configure GitHub Actions secrets (DEPLOY_SERVER_HOST, DEPLOY_SSH_KEY, etc.) | ⏳ Pending |
| 4   | Configure GitHub Actions vars (DOMAIN, GHCR_USERNAME, etc.)                 | ⏳ Pending |
| 5   | Set up Postgres + Redis on VPS, run db/schema.sql                           | ⏳ Pending |
| 6   | Configure DNS (play-vaultfront._, api-vaultfront._ → VPS IP)                | ⏳ Pending |
| 7   | Run first deploy + verify /commit.txt, WebSocket, CORS, /health             | ⏳ Pending |
| 8   | Swap deploy-pages.yml to real client bundle (after step 7)                  | ⏳ Pending |

---

## Immediate next actions (AI-executable, session 5)

**Do in this order — each unlocks the next:**

1. **[B-3]** Docker Compose — Postgres + Redis + app in one command (enables local Postgres testing)
2. **[B-1]** Wire Postgres — install `pg`, connection pool, migrate 4 in-memory stores to SQL
3. **[B-2]** Wire VaultMetrics — add ~20 lines of `.record*()` calls to GameServer event sites
4. **[B-21]** CodeQL + Semgrep SAST — one workflow file addition
5. **[B-7]** Match invite deep links with OG preview meta

---

## Key context files

- `context/CURRENT_STATE.md` — canonical repo + deployment state
- `context/TASK_BOARD.md` — all tasks (B-items brainstorm + carry-forward queued)
- `docs/VAULTFRONT_SOURCE_MAP.md` — every VaultFront-owned or modified file
- `docs/DEPLOY_RUNTIME_RUNBOOK.md` — step-by-step deploy instructions
- `src/server/db/schema.sql` — Postgres schema (tables defined, not yet connected)

---

## Git state

- Branch: `main`
- Remote: `origin` (VaultSparkStudios/vaultfront)
- Status: session 3 + session 4 closeout work committed locally; push pending
- All new files from session 3 committed: AchievementStore, EloRating, PlayerStatsStore,
  VaultMetrics, VaultSeasonScheduler, AchievementToast, HistoryModal, db/schema.sql,
  grafana-dashboard.json, .renovaterc.json
