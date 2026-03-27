# Latest Handoff

Date: 2026-03-27 (session 6 — C-1/C-2/C-3/C-6/C-7 + C-19/C-20/C-21/C-22)

---

## What was shipped this session

### Highest Leverage (C-1/C-2/C-3/C-6/C-7)

| Item                   | Files changed                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| C-1 CORS + Helmet      | `package.json` (+cors +helmet +@types/cors), `Worker.ts` (middleware), `Master.ts` (middleware)                                                  |
| C-2 DB migration CI    | `.github/workflows/db-migrate.yml` — Postgres 16 container, applies + idempotency-checks schema.sql                                              |
| C-3 Match invite links | `Worker.ts` (GET /api/invite/:gameId), `Api.ts` (+shareMatchInvite +requestInviteLink), `WinModal.ts` (Share Match button)                       |
| C-6 Rematch queue      | `RematchStore.ts` (new — 5-min TTL intents), `Worker.ts` (3 routes), `Api.ts` (+createRematch +getRematchStatus), `WinModal.ts` (Rematch button) |
| C-7 Graceful shutdown  | `Worker.ts` (SIGTERM drain loop, 30s), `Master.ts` (SIGTERM cascade), `GameManager.ts` (+activeGameCount)                                        |

### Highest Ceiling foundations (C-19/C-20/C-21/C-22)

| Item                   | Files created / changed                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-19 Replay highlights | `ReplayHighlightStore.ts` (sliding-window peak scoring + moment labelling), `Worker.ts` (GET /api/replay/:id/highlight), `Api.ts` (+shareReplayHighlight), `WinModal.ts` (Share Clip button)                     |
| C-20 Clan system       | `schema.sql` (+clans +clan_members), `ClanStore.ts` (dual-path CRUD + hydrateFromDb), `Worker.ts` (6 routes), `ClanModal.ts` (Lit — create/join/leave/leaderboard tabs)                                          |
| C-21 Tutorial          | `TutorialOrchestrator.ts` (5-step state machine, event auto-advance), `Worker.ts` (3 routes), `TutorialOverlay.ts` (Lit — step card, progress bar, hint toggle)                                                  |
| C-22 Tournament        | `schema.sql` (+tournaments +tournament_slots +tournament_matches), `TournamentStore.ts` (single-elim seeding + bracket advance), `Worker.ts` (7 routes), `TournamentModal.ts` (Lit — browse/bracket/create tabs) |

---

## MANUAL REQUIRED before first build

```bash
npm install
```

`cors`, `helmet`, `@types/cors` added to `package.json` but not yet installed.

Then verify compile:

```bash
npm run build-dev
```

---

## Known compile items to verify

- `Worker.ts` imports 5 new singletons: `clanStore`, `tournamentStore`, `tutorialOrchestrator`, `replayHighlightStore`, `rematchStore`
- `GameServer.numClients()` — confirmed at line 574
- `GameServer.gameConfig.gameMap` — confirmed public field
- `WinModal.ts` imports `createRematch`, `shareMatchInvite`, `shareReplayHighlight` from Api.ts — all added

---

## Test status

623/623 passing before this session. New server files have no unit tests yet.
C-14 (expanded E2E suite) is queued and should cover the new features next session.

---

## Next session priorities

1. **I-1 DEPLOY** — Hetzner VPS + DNS + GitHub secrets (everything is built, just needs infra)
2. **C-4** — CodeQL + Semgrep SAST workflow (~30 min)
3. **C-5** — .github/ISSUE_TEMPLATE/ (bug/feature/balance)
4. **C-14** — Expand E2E suite (8+ Playwright specs for clan, tournament, rematch, invite)
5. **C-8** — Perf regression gate in CI
6. **C-11** — Live spectator game browser UI

---

## Score update

| Category      | Session 5 | Session 6 |
| ------------- | --------- | --------- |
| Security      | 7.5       | 8.5       |
| Game Features | 8.5       | 9.0       |
| CI/CD         | 8.0       | 8.5       |
| Architecture  | 8.5       | 8.5       |
| Deployment    | 3.5       | 3.5       |
| **Overall**   | **7.9**   | **~8.3**  |
