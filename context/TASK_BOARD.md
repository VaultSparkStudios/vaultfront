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

## Completed (2026-05-18 — Session 5 /implement pass)

All 16 items from `docs/AUDIT_2026-05-18_S5.md` shipped:
vault-fortune-post-win (FortuneDeck + WinModal fortune card), play-style-career-arc
(styleHistory store + PlayStyleCareerArc component + postStyleHistory), achievement-chain-meta
(5 meta-chains: vault_sovereign/convoy_legend/surge_master/speed_demon/grand_architect),
ai-prematch-intelligence-brief (Haiku pre-match endpoint + LRU cache), clan-war-scheduler
(ClanWarStore + challenge/accept/decline/result endpoints), season-pass-track-ui
(SeasonMilestoneStore + SeasonPassTrack component), spectator-prediction-league
(PredictionLeagueStore + weekly leaderboard), post-match-ai-coach-debrief (WinModal
coach tab + fetchCoachDebrief), ai-narrative-game-recap (WinModal match story tab +
fetchMatchRecap), tournament-bracket-ui (TournamentBracketView SVG component),
achievement-profile-panel (AchievementsPanel + meta-chains display), advanced-tutorial-hints
(ADVANCED_HINTS + onFirstConvoyLaunched/onDynastySeasonStart methods), match-outcome-rating
(MatchRatingPrompt 5-star component + postMatchRating), replay-integrity-signature
(HMAC-SHA256 in ReplayStore), mobile-layout-optimization (scaleFactor helper in
VaultFrontLayer for narrow canvas banners), sil-score-pipeline-fix (rolling-status block
in SELF_IMPROVEMENT_LOOP.md).

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

## Completed (2026-07-16 — Session 72 recovery closeout)

Recovered and verified the interrupted post-S71 tree: retained the validated Studio protocol/Canon/Dependabot propagation, removed incompatible/unreferenced Obelisk helpers from deployable `src/`, untracked the local ignored passport cargo so quarantine is real, preserved the rights ledger locally while removing it from the public index, and proved the boundary with 94 files / 655 tests plus 10 server files / 30 tests and Studio doctor `blockingFailing: 0`.

- [SIL] Reconcile registry `app/public-unlaunched` metadata with local `game/internal` project truth so audit and release gates consume one intentional profile.
- [SIL] Add a recovery-provenance check that distinguishes `lint-staged` backup residue, propagated protocol files, and current-session generated artifacts.

## Completed (2026-06-14 — Session 71 /audit + /implement pass)

All 3 items from `docs/AUDIT_2026-06-14_S71.md` shipped: `obelisk-passport-quarantine`, `protocol-helper-regression-harness`, and `s71-truth-sync`. Verification passed with focused Studio helper Vitest, startup brief render/validation, compact handoff, secrets audit, blocker preflight, PROJECT_STATUS invariant check, broad `npm test` (94 files / 655 tests plus 10 server files / 30 tests), and `npm run build-prod`.

- Keep generated `obelisk-passport/` local until the relying-party production origin is registered and the login/callback/server verify path is intentionally wired.
- Keep the HUMAN PRESSURE startup block as a recommended future renderer improvement; current validation remains conformant without it.

## Unified Genius List (2026-06-13 — Session 70 /go)

- [done] 🔥 feedback_loop / automation · 20m · Alpha Gate Passport verification smoke — **DONE S70**: focused pulse/readiness/sidebar Vitest passed 14 tests after protocol repair.
- [done] ⚡ process / truth · 20m · Document next alpha-gate operator action — **DONE S70**: task board synced append-only, startup brief regenerated, and `validate-task-ids` passed.
- [done] ⚡ capital_efficiency / truth · 20m · Keep revenue warning honest — **DONE S70**: startup brief still reports revenue signal as blocked/unverified and broad `npm test` passed.
- [done] ⚡ dev_health / automation · 20m · Production build regression gate — **DONE S70**: `npm run build-prod` passed after `/go` helper repair.
- [human-blocked] 🔥 feedback_loop / launch · 1h · Manual rivalry/rematch alpha playtest — requires real tester/manual playtest evidence.
- [human-blocked] ⚠ capital_efficiency / revenue · manual · Observe live checkout/supporter event — requires real checkout/supporter telemetry.

## Completed (2026-06-14 — Session 70 /audit + /implement pass)

All 3 items from `docs/AUDIT_2026-06-14.md` shipped: `alpha-gate-operator-runbook`, `go-helper-regression-smoke`, and `readiness-alpha-evidence-copy`. Verification passed with focused Vitest, `npx tsc --noEmit`, production build, and broad `npm test` (93 files / 652 tests plus 10 server files / 30 tests).

- Use the KPI Alpha Gate strip during the next rivalry/rematch alpha gate; do not mark the live playtest complete until all five `alphaGate.checks` are green from real tester evidence.

- ~~Run a focused internal rivalry/rematch playtest and inspect the new pulse fields: `retentionChallengeShown`, `retentionRequeued`, `retentionRematchRequested`, and `rates.retentionAction`.~~ ✅ Instrumented for the next playtest (Session 68 adds `operatorNext`, KPI Rival action %, and latest signal age).
- ~~Fix unrelated global lint blockers in e2e/project-service config and Studio script lint debt.~~ ✅ Done
- ~~Fix pre-existing `src/server/Master.ts(166,30)` type error~~ ✅ Done
- ~~Run `npm run build-prod` and `npm run e2e` after this readiness pass to promote tournament playtest confidence.~~ ✅ Done (`build-prod` green; CI-style serial E2E green with one flaky retry)
- Wire a live revenue signal into the startup brief once checkout or supporter telemetry is observable.
- ~~Repair broad `npm test` residuals: `VaultFrontExecution` mock/BigInt failures and `CoachHintEngine` trigger-field assertion.~~ ✅ Done (Session 64 — all 90 test files / 637 tests green)
- ~~Consider a compact/mobile tutorial pattern that teaches VaultFront mechanics without a modal overlay.~~ ✅ Done (Session 65 — first-run mobile strip with tutorial pulse telemetry)
- ~~Run a mobile tutorial smoke in browser to verify strip placement against the live control panel.~~ ✅ Automated compact-width component smoke added in Session 66; manual browser playtest still useful before a public flip.
- Use the `operatorNext` script in `/api/vaultfront/playtest-pulse/summary` during the next internal rivalry/rematch alpha gate.
- Use the KPI Playtest Pulse tile to inspect Rival action %, latest signal age, and the next operator action after the next internal playtest.
- Use readiness `playtest-pulse` action insights as the next alpha gate; stale evidence, tutorial, feedback, and retention warnings should name the next action directly.
- Keep startup helper-chain drift on the next closeout radar; compact handoff and startup render are green after S66 helper restores.
- Observe a real checkout/supporter event and set `VAULTFRONT_REVENUE_OBSERVED=1` only after evidence exists.

## Deferred to Project Agents

- cross-repo item owned by another repo agent:
