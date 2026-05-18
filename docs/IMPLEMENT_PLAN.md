# Implement Plan — AUDIT_2026-05-17_S3 (Session 3)

> Session 3 plan below. Session 2 plan (all 24 shipped) preserved for reference below the divider.

## Session 3 — Optimal Efficiency Sequence (19 items)

| Seq | Slug                        | Effort | Priority | Rationale                             |
| --- | --------------------------- | ------ | -------- | ------------------------------------- |
| 1   | automated-anti-cheat-alerts | 2h     | 17.5     | Security, server-only, fast win       |
| 2   | dynasty-story-engine        | 2h     | 32.0     | 🔥 #1 priority, Worker.ts AI endpoint |
| 3   | bot-ai-persona-backstories  | 2h     | 21.0     | Same Worker.ts context                |
| 4   | cinematic-intercept-moment  | 2h     | 24.0     | 🔥 UX, PixiJS client                  |
| 5   | season-contract-hud         | 2h     | 17.5     | Lit component, same client context    |
| 6   | in-game-mutator-vote        | 2h     | 17.5     | WinModal, same context                |
| 7   | ignis-founder-feedback-loop | 4h     | 21.7     | Foundation endpoint + DB              |
| 8   | in-game-micro-coach         | 4h     | 24.7     | 🔥 AI + CoachHintEngine client        |
| 9   | predictive-pre-match-oracle | 4h     | 18.9     | AI + GameStartingModal                |
| 10  | living-match-narrator       | 4h     | 31.3     | 🔥 SpectatorBus + NarratorBus         |
| 11  | route-intelligence-network  | 4h     | 21.7     | VaultFrontExecution new command       |
| 12  | match-replay-highlight-reel | 4h     | 16.3     | ReplayPanel + WinModal                |
| 13  | streaming-overlay-api       | 4h     | 18.9     | StreamingBus server infra             |
| 14  | ab-results-dashboard        | 4h     | 11.6     | Admin page                            |
| 15  | fog-of-war-memory-decay     | 8h     | 21.7     | 🔥 TerritoryLayer large change        |
| 16  | spectator-economy           | 8h     | 19.3     | SpectatorBet DB + endpoints           |
| 17  | world-events-system         | 8h     | 19.3     | WorldEventScheduler server            |
| 18  | clan-war-tournament         | 8h     | 14.4     | TournamentStore extension             |
| 19  | narrative-batch-caching     | 2h     | 15.0     | Token-cost — measure last             |

---

# Implement Plan — AUDIT_2026-05-17 Session 2

Generated: 2026-05-17 · 24 items · Combined Priority: 943.5

## Optimal Efficiency Sequence

Items re-sorted by axis grouping + effort-to-impact ratio. Same-axis items batched to
minimize context-switching on shared code surfaces.

---

### Group 1 — Execution Core (VaultFrontExecution.ts + Game.ts + GameUpdates.ts)

| Seq | Slug                       | Tier | Effort | Priority |
| --- | -------------------------- | :--: | ------ | :------: |
| 1   | vault-heist                |  🔥  | 4h     |   94.0   |
| 2   | bounty-board               |  🔥  | 4h     |   83.6   |
| 3   | warchest-hunt              |  🔥  | 4h     |   74.3   |
| 4   | map-events-system          |  ⚡  | 8h     |   50.6   |
| 5   | match-intel-layer          |  ⚡  | 4h     |   37.1   |
| 6   | economic-warfare-expansion |  ⚡  | 8h     |   32.5   |

### Group 2 — AI API Endpoints (Worker.ts)

| Seq | Slug                  | Tier | Effort | Priority |
| --- | --------------------- | :--: | ------ | :------: |
| 7   | vault-prophecy        |  ⚡  | 2h     |   52.5   |
| 8   | live-event-commentary |  ⚡  | 2h     |   47.3   |
| 9   | npc-lore-generation   |  ⚡  | 2h     |   36.0   |
| 10  | mission-brief-system  |  ⚡  | 4h     |   41.8   |
| 11  | ai-coach-overlay      |  ⚡  | 8h     |   36.6   |
| 12  | claude-prompt-caching |  💡  | 1h     |   17.7   |

### Group 3 — Bot System

| Seq | Slug                       | Tier | Effort | Priority |
| --- | -------------------------- | :--: | ------ | :------: |
| 13  | adaptive-bot-personalities |  ⚡  | 8h     |   28.9   |

### Group 4 — UX / Client

| Seq | Slug                     | Tier | Effort | Priority |
| --- | ------------------------ | :--: | ------ | :------: |
| 14  | cognitive-load-reduction |  ⚡  | 4h     |   43.3   |
| 15  | contextual-tutorial      |  ⚡  | 8h     |   28.9   |
| 16  | color-blind-mode         |  💡  | 4h     |   13.9   |

### Group 5 — Post-Game / Data

| Seq | Slug                 | Tier | Effort | Priority |
| --- | -------------------- | :--: | ------ | :------: |
| 17  | session-insight-card |  💡  | 4h     |   21.7   |
| 18  | live-replay-theater  |  ⚡  | 1d     |   34.5   |
| 19  | dynasty-mode         |  ⚡  | 1d     |   46.0   |

### Group 6 — Large Systems

| Seq | Slug                 | Tier | Effort | Priority |
| --- | -------------------- | :--: | ------ | :------: |
| 20  | mobile-touch-support |  ⚡  | 1d     |   30.2   |
| 21  | live-tournament-mode |  ⚡  | 1d     |   51.8   |

### Group 7 — Infrastructure

| Seq | Slug                | Tier | Effort | Priority |
| --- | ------------------- | :--: | ------ | :------: |
| 22  | anti-cheat-signals  |  💡  | 4h     |   9.3    |
| 23  | tile-delta-encoding |  💡  | 1d     |   11.5   |
| 24  | clan-wars           |  💡  | 1w     |   19.5   |

---

_Generated by /implement v1.0 · Execution tracking in AUDIT_2026-05-17.md_
