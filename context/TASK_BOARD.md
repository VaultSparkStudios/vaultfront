# Task Board

Public-safe roadmap only. Detailed backlog sequencing is maintained privately.

## Completed (2026-05-17 — Session 2 /implement pass)

All 24 Session-2 audit items shipped. Key wins: vault-heist, bounty-board, warchest-hunt, 5 AI narrative endpoints (prophecy/commentary/lore/mission/coach), 6 map events, economic warfare (sabotage/bribe/trade), adaptive bot personalities, dynasty-mode server logic, color-blind mode, play-style insight card, TouchHandler mobile gestures, anti-cheat admin endpoint, tile dedup encoding, clan ELO.

## Completed (2026-05-17 — Session 1 /implement pass)

All 19 items from `docs/AUDIT_2026-05-17.md` (Session 1) shipped.
Key wins: last-stand-event, convoy-intercept-predictor, ai-battle-narrative,
smart-spectator-camera, convoy-ghost-route, bot-vaultfront-awareness,
api-auth-security, context-token-ledger, all mutator expansions, Elo/rank system.

## Completed (2026-05-18 — Repair /implement pass)

All 6 items from `docs/AUDIT_2026-05-18.md` shipped: startup-brief-repair,
contract-hud-live-progress, coach-hint-site-signal, stream-overlay-reconnect-memory,
narrator-bus-token-guardrails, and anti-cheat-alert-cooldown.

## Completed (2026-05-18 — Session 4 /implement pass)

All 18 new items from `docs/AUDIT_2026-05-18.md` (Session 4) shipped:
master-ts-build-fix, global-lint-unblock, narrator-sentiment-persona (HYPE/TACTICAL/COMEDIC),
narrator-match-context, coach-hint-event-triggers (5 trigger types), play-style-mid-match (PlayStyleChip),
overlay-priority-queue, mutator-live-vote-banner, elo-winmodal-animation (rAF counter),
dynasty-story-winmodal (typewriter), post-match-share-card (OffscreenCanvas PNG),
seasonal-rank-decay (RankBadge orange pulse), elo-rank-sparkline (SVG hover),
spectator-crowd-prediction (NarratorBus crowd_vote SSE), replay-ai-highlight (autoHighlightTick),
daily-challenge-system (DailyChallengeStore + HUD card), vault-intelligence-market
(intel-purchase endpoint + canvas tooltip), token-oracle-cache (5-min LRU).

## Follow-ups

- ~~Fix unrelated global lint blockers in e2e/project-service config and Studio script lint debt.~~ ✅ Done
- ~~Fix pre-existing `src/server/Master.ts(166,30)` type error~~ ✅ Done

## Deferred to Project Agents

- cross-repo item owned by another repo agent:
