# VaultFront — Codex Handoff 2026-03-27 (Session 4)

## What happened this session

Audit-only pass. No new features shipped. Full deep-dive re-audit of the entire codebase
including all session-3 files. Produced a 25-item brainstorm (B-items). Closed out all
session state files and committed everything to main.

---

## Critical gaps to fix first (session 5 must-do)

**None of these are optional for production:**

1. `pg` npm package is not in `dependencies` — Postgres is unreachable
2. PlayerStatsStore, AchievementStore, VaultSeasonScheduler — all in-memory only
3. VaultMetrics — 7 counters exist, zero recording calls in GameServer
4. No Docker Compose — local Postgres requires manual setup
5. Only 4 E2E Playwright specs for an entire game

**Fix order: B-3 (Docker Compose) → B-1 (Wire Postgres) → B-2 (Wire VaultMetrics)**

---

## Audit scores (session 4)

| Category         | Score        |
| ---------------- | ------------ |
| Documentation    | 8.5          |
| Security         | 8.0          |
| Game Features    | 8.0          |
| Architecture     | 8.0          |
| Code Quality     | 7.5          |
| CI/CD            | 7.5          |
| DX               | 7.5          |
| Tests            | 7.0          |
| Identity / Brand | 7.0          |
| Momentum         | 5.0          |
| Deployment       | 3.0          |
| **Overall**      | **7.6 / 10** |

---

## Manual blockers (human only — do not attempt in AI session)

```
0. npm install --save-dev @playwright/test && npx playwright install chromium
1. Rename local folder: OpenFrontIO → VaultFront
2. Provision Hetzner VPS (CX32): Docker + Caddy + Postgres + Redis, open 80/443
3. GitHub Actions secrets: DEPLOY_SERVER_HOST, DEPLOY_SSH_KEY, GHCR_TOKEN,
   API_KEY, TURNSTILE_SECRET_KEY, OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_AUTH_HEADER
4. GitHub Actions vars: DOMAIN, GHCR_USERNAME, GHCR_REPO, DEPLOY_REMOTE_USER
5. VPS: create vaultfront Postgres DB + Redis instance, run src/server/db/schema.sql
6. DNS: play-vaultfront.vaultsparkstudios.com + api-vaultfront.vaultsparkstudios.com → VPS IP
7. Trigger Deploy workflow → verify /commit.txt, WebSocket, CORS, /health
8. Swap deploy-pages.yml to real client bundle (after step 7)
```

---

## Next session start checklist

1. Read: `context/LATEST_HANDOFF.md` + `context/TASK_BOARD.md` (B-items section)
2. Read: `docs/VAULTFRONT_SOURCE_MAP.md` (to know which files are VaultFront-owned)
3. Read: `src/server/PlayerStatsStore.ts` lines 100–120 (the Postgres TODO)
4. Read: `src/server/GameServer.ts` lines 1–100 (to find event hooks for VaultMetrics)
5. Execute: B-3 → B-1 → B-2 in order

---

## Brainstorm index (B-items)

All 25 items are in `context/TASK_BOARD.md` under "Queued — Session 4 brainstorm."

**Highest leverage (low effort, real impact):** B-1, B-2, B-3, B-7, B-14, B-21, B-24
**Highest ceiling (transformative):** B-25, B-8, B-12, B-13, B-18, B-11
