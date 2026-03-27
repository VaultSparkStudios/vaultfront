# Latest Handoff

Date: 2026-03-27 (session 5 — B-3/B-1/B-2)

---

## Session summary — 2026-03-27 (session 5)

Shipped B-3 (Docker Compose), B-1 (Postgres integration), B-2 (VaultMetrics wiring).
All previously in-memory stores now have persistent Postgres paths.
OTel metrics now record end-of-game vault stats.

### Shipped this session

- **docker-compose.yml**: Postgres 16-alpine + Redis 7-alpine, healthchecks, schema auto-applied
- **pg@8.20**: installed as runtime dependency
- **src/server/db/pool.ts**: Pool singleton; `null` when `DATABASE_URL` absent
- **src/server/db/schema.sql**: added `player_achievements` + `season_votes` tables
- **PlayerStatsStore.ts**: full Postgres dual-path — UPSERT player, transactional match
  recording with per-player Elo updates, leaderboard cache refresh in same transaction
- **AchievementStore.ts**: fire-and-forget persist to `player_achievements`; `hydrateFromDb()`
  loads prior unlocks at game start so achievements are not re-awarded
- **VaultSeasonScheduler.ts**: `recordVote()` persists to `season_votes`; `loadVotesFromDb()`
  restores current week's vote counts on startup
- **VaultMetrics.ts**: `recordMatchAggregates()` — bulk OTel recording for end-of-game stats
- **GameServer.ts**: `archiveGame()` sums `vaultCaptures`, `convoyDeliveries`,
  `cleanExecutionStreaks`, `surgeActivations` from `allPlayersStats` → `recordMatchAggregates()`

### Test status

- 623/623 unit tests green
- Zero TypeScript errors
- Last pushed: `888b0cc4` (main in sync with origin/main)

---

## What's still pending — next session

**Highest leverage (low effort):**

- [B-7] Match invite deep links with OG preview meta
- [B-14] Revenge queue / rematch button
- [B-21] CodeQL + Semgrep SAST (one CI workflow file)
- [B-24] Contributing guide + GitHub issue templates

**Medium effort:**

- [B-4] DB migration CI job (apply schema.sql in a test Postgres container)
- [B-6] Full Discord bot with slash commands
- [B-9] Live spectator game browser UI

**Transformative:**

- [B-25] AI post-match recap (Claude API)
- [B-12] Clan / Squad system
- [B-13] Tournament brackets

---

## Manual blockers (still all pending — see TASK_BOARD.md)

| #   | Task                                         | Status     |
| --- | -------------------------------------------- | ---------- |
| 0   | npm install + playwright install chromium    | ⏳ Pending |
| 1   | Rename local folder OpenFrontIO → VaultFront | ⏳ Pending |
| 2   | Provision Hetzner VPS                        | ⏳ Pending |
| 3   | GitHub Actions secrets                       | ⏳ Pending |
| 4   | GitHub Actions vars                          | ⏳ Pending |
| 5   | Postgres + Redis on VPS → run schema.sql     | ⏳ Pending |
| 6   | DNS records                                  | ⏳ Pending |
| 7   | First deploy + verify                        | ⏳ Pending |
| 8   | Swap Pages to real client bundle             | ⏳ Pending |

**Local dev shortcut**: `docker compose up -d` then `DATABASE_URL=postgres://vaultfront:vaultfront@localhost:5432/vaultfront npm run dev`

---

## Key context files

- `context/TASK_BOARD.md` — B-items (B-1/B-2/B-3 done; B-4 through B-25 queued)
- `docs/VAULTFRONT_SOURCE_MAP.md` — every VaultFront-owned file
- `docs/DEPLOY_RUNTIME_RUNBOOK.md` — deploy step-by-step
- `src/server/db/schema.sql` — Postgres schema (all 5 tables)
- `docker-compose.yml` — local Postgres + Redis
