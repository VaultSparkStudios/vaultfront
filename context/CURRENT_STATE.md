# Current State

Public-safe summary:

- this repo remains deployable
- internal operational records were sanitized for public-repo safety on 2026-04-03
- detailed internal state now lives in the private Studio OS / ops repository

## 2026-06-07 — Session 68 Operator Playtest Script + KPI Conversion Pass Complete

Shipped 2 product items plus truth sync from `docs/AUDIT_2026-06-07_S68.md`.

**New fixes added:**

- Playtest pulse summaries now include an `operatorNext` contract with a headline, concrete playtest steps, and a success metric derived from the same pulse truth used by readiness.
- Stale playtest evidence is now prioritized in pulse action insights so old launch evidence cannot be hidden behind tutorial or feedback warnings.
- The in-game KPI Playtest Pulse tile now shows Rival Challenge action conversion, latest signal age, and the next operator action, making the internal rivalry/rematch alpha gate inspectable without a curl command.
- `PROJECT_STATUS` now reflects Session 68 focus and 645 broad passing tests plus 25 server tests.

**Verification:** syntax checks passed for `VaultFrontPlaytestPulse`, `Api`, and `GameRightSidebar`; focused Vitest passed 8 tests across pulse/sidebar coverage; `npm run build-prod` is green; broad `npm test` is green (91 files / 645 tests, plus 9 server files / 25 tests). Existing non-blocking warnings remain: Vite public URL placeholders, mixed JSON import attributes, large chunks, Lit dev-mode stderr, expected test stderr, and a Node tooling deprecation warning.

## 2026-06-07 — Session 67 Playtest Funnel + Rival Telemetry Pass Complete

Shipped all 4 items from `docs/AUDIT_2026-06-07_S67.md`.

**New fixes added:**

- Playtest pulse summaries now report tutorial advance/completion/skip rates, match feedback rate, Rival Challenge exposure/action counters, retention action rate, and operator-facing action insights.
- `WinModal` now records Rival Challenge retention pulse events when players see the challenge, save the next-match goal, requeue, or request a rematch after rivalry revenge progress.
- Readiness playtest-pulse evidence now includes the first action insight, turning the launch gate into a concrete next-playtest prompt.
- `PROJECT_STATUS` now reflects Session 67 focus, 643 broad passing tests plus 24 server tests, and SIL 998 held.

**Verification:** syntax checks passed for `VaultFrontPlaytestPulse`, `VaultFrontReadiness`, `Api`, and `WinModal`; focused Vitest passed 17 tests across pulse/readiness/WinModal; `npm run build-prod` is green; broad `npm test` is green (91 files / 643 tests, plus 9 server files / 24 tests). Existing non-blocking warnings remain: Vite public URL placeholders, mixed JSON import attributes, large chunks, Lit dev-mode stderr, and expected test stderr.

## 2026-06-05 — Session 66 Protocol + Mobile Evidence + Rival Loop Pass Complete

Shipped all 4 items from `docs/AUDIT_2026-06-05_S66.md`.

**New fixes added:**

- Startup protocol helper chain restored: `turn-classifier`, `sil-forecaster`, `visual-blocks`, and `skill-cost-ledger` now let compact handoff and startup brief rendering complete cleanly.
- Mobile first-run tutorial now has an automated compact-width smoke test proving the strip renders, advances, dismisses, and records tutorial pulse telemetry.
- Post-match `WinModal` now surfaces a Rival Challenge card when rivalry revenge progress exists, turning the existing counter into a visible rematch/requeue retention prompt.
- `.ops-cache/` is ignored with other generated session cache artifacts.
- `PROJECT_STATUS` now reflects Session 66 focus, 640-test evidence, and SIL 998.

**Verification:** `node --check` passed for all restored protocol helpers; `node scripts/compact-handoff.mjs` and `node scripts/render-startup-brief.mjs` pass; focused `VaultFrontTutorial` + `WinModal` Vitest passes 9 tests; `npm run build-prod` is green; broad `npm test` is green (91 files / 640 tests, plus 9 server files / 23 tests); `node scripts/lib/write-project-status.mjs --check` passes.

## 2026-06-05 — Session 65 Protocol + Mobile Onboarding Audit+Implement Pass Complete

Shipped all 4 items from `docs/AUDIT_2026-06-05_S65.md`.

**New fixes added:**

- Mobile first-run tutorial now renders as a compact bottom strip on narrow screens instead of being suppressed entirely; tutorial pulse telemetry remains intact.
- Readiness payloads now accept a `revenueSignal` contract with `observed` / `unverified` states, wired from `VAULTFRONT_REVENUE_OBSERVED` on master and worker.
- Startup brief revenue logic now reads `PROJECT_STATUS.revenueSignalStatus` safely and no longer treats `unverified` as `verified`.
- Blocker preflight attempt-order output now renders as ordered steps instead of one bullet per character.
- `PROJECT_STATUS` now reflects the latest public-safe truth: Session 65 focus, 638-test evidence, and SIL 997.

**Verification:** blocker scripts pass `node --check`; `node scripts/ops.mjs blocker-preflight` renders correctly; `tests/server/VaultFrontReadiness.test.ts` passes 4 tests; `npm test` is green (90 files / 638 tests, plus 9 server files / 23 tests); `npm run build-prod` is green; startup brief render and validation pass with only the existing recommended `HUMAN PRESSURE` warning.

**Closeout verification rerun:** Codex reran the S65 audit verification on 2026-06-05: `node --check scripts/blocker-preflight.mjs`, `node --check scripts/lib/blocker-rules.mjs`, `node scripts/ops.mjs blocker-preflight`, `npx vitest run tests/server/VaultFrontReadiness.test.ts`, `npm run build-prod`, and broad `npm test` all passed. Residual warnings remain non-blocking: Vite public URL placeholders, mixed JSON import attributes, large chunks, and expected test stderr.

**Closeout hygiene continuation:** Added `.cache/` and `ignis/output/` to `.gitignore` so generated session/IGNIS artifacts no longer leave the public repo dirty after `/start` and closeout probes.

## 2026-05-17 — Full Audit+Implement Pass Complete

All 19 items from `docs/AUDIT_2026-05-17.md` shipped across two sessions.

**New systems added:**

- VaultFront Execution: last-stand-event, convoy-intercept-predictor (live gauge), 10-mutator expansion (blitz/no_mercy/contested/shield_escort/rally_point/execution_rush/gold_rush), convoy ghost-route cloaking, per-player command rate limiting
- Client rendering: last-stand banner, intercept probability bar, ghost convoy overlay, SpectatorAutoCamera (heatmap auto-follow, 'A' toggle)
- AI/battle narrative: Claude Haiku match story generation (WinModal)
- Replay: custom clip share endpoint + ReplayPanel UI button
- Community: weekly mutator vote (Discord announce + POST /api/mutator-vote)
- Rank/Elo: RankBadge component, placement match ramp (K=64 for first 5), seasonal soft-reset, win-modal post-game vote prompt
- Bots: VaultFront command dispatch + vault-site targeting bias in AiAttackBehavior
- Security: per-player VaultFrontCommand rate limiter (5/10-tick window)
- Ops: Stop-hook ledger writer (docs/cache-ledger.ndjson → context-meter confidence: measured)

## 2026-05-18 — Repair Audit+Implement Pass Complete

Shipped all 6 items from `docs/AUDIT_2026-05-18.md`.

**New fixes added:**

- Startup brief generation repaired with missing helper modules for cross-repo task summaries, IGNIS insight fallback, and human-action age tracking.
- Contract HUD now reflects live intercept/capture/comeback progress every tick instead of missing updates between 30-second server refreshes.
- Micro-coach hints now use real local vault-site ownership from `VaultFrontStatus` rather than a player-count proxy.
- Streaming overlay SSE now replays recent events to reconnecting OBS/browser-source overlays.
- Narrator bus now deduplicates/caps event prompts and lazy-loads Anthropic to avoid unnecessary client setup.
- Anti-cheat monitor now has alert cooldown and bounded seen-game retention.

**Verification:** focused Vitest suite passed (5 files), modified-file ESLint passed, startup brief render passed. Full lint/build remain blocked by unrelated pre-existing repo issues documented in the audit execution log.

## 2026-06-03 — Launch Readiness Audit+Implement Pass Complete

Shipped all 4 items from `docs/AUDIT_2026-06-03.md`.

**New fixes added:**

- Readiness endpoint: `/api/vaultfront/readiness` now reports server health, launch gates, test surfaces, free-tier posture, AI cost guardrail posture, and revenue-signal warning from both master and worker processes.
- Tournament operations: `TournamentModal` can now seed a registration bracket and report per-match winners through the existing tournament APIs.
- Startup/test registration: `context/PROJECT_STATUS.json` now declares VaultFront as a game repo with concrete test surfaces for unit/server regression, production build, E2E smoke, and local manual playtesting.
- Cost discipline: free-tier posture is recorded as `exempt-internal`, with live revenue still explicitly marked unverified.

**Verification:** focused readiness Vitest passed, TypeScript no-emit passed, and touched-file ESLint passed.

## 2026-06-04 — Session 64 Comprehensive Audit+Implement Pass Complete

Shipped all 12 Wave 1+2 items from `docs/AUDIT_2026-06-04_S64.md`.

**Wave 1 (critical + quick):**

- Vitest residuals: all 90 test files (637 tests) fully green — 3 pre-existing mock-staleness failures repaired (VaultFrontExecution x/y/isValidCoord/ref mocks, VaultFrontLifecycle accumulatedPassiveGold, CoachHintEngine trigger field)
- Entropy computed: `entropyScore: 0.08` (healthy) written to PROJECT_STATUS.json
- ContractHudWidget/VaultFrontLayer: intercept probability bar pulses with red glow when >70%; CoachHintEngine `convoy_danger` trigger (2-min cooldown)
- CoachHintEngine: `economy_stall` trigger when gold <150k + no active convoys
- CoachHintEngine: 5-min LRU cache keyed on {trigger, gold_bucket, sites} — expected 40-60% micro-hint call reduction
- VaultFrontExecution: 3 rate-limiter boundary tests (exactly-5 / reject-6th / window-reset)

**Wave 2 (feature additions):**

- KPI panel: Playtest Pulse tile (traffic-light no-signal/warming/ready + score, tutorial completion rate, match feedback, tournament actions)
- KPI panel: My Session stats card (matches played, avg first intercept, comeback rate, current Elo)
- VaultFrontExecution: Chain Guardian badge — 3 consecutive vault captures emits `chain_guardian_earned` activity; added to GameUpdates union + SpectatorAutoCamera heat weights
- LeaderboardModal: Prediction League tab with weekly accuracy table fetched from existing PredictionLeagueStore endpoint
- NarratorBus: auto-blend blendMode (tactical/mixed/hype) computed from tickBucket; appended to persona system prompt at generation time — no new Haiku calls
- GameStartingModal: AI pre-match brief wired — fetchPrematchBrief fetched in parallel with oracle + prophecy; renders as cyan 'Pre-Match Brief' card (endpoint + API already existed)

**Verification:** all 90 test files (637 tests) pass; `tsc --noEmit` clean; `npm run build-prod` green; touched-file ESLint clean.

## 2026-06-03 — Session 63 Playtest Pulse Audit+Implement Pass Complete

Shipped all 4 items from `docs/AUDIT_2026-06-03_S63.md`.

**New fixes added:**

- Playtest pulse: new in-memory server summary for tutorial, match-feedback, tournament-ops, and retention signals, exposed through `/api/vaultfront/playtest-pulse`.
- Readiness evidence: `/api/vaultfront/readiness` now includes playtest pulse status, score, freshness, and launch-gate evidence.
- Tutorial telemetry: desktop first-run tutorial now records shown/advance/skip/complete events; compact/mobile viewports defer the modal so it does not block the play grid.
- Tournament operations: bracket responses now include an operator brief with registered player count, missing slots, next action, next match, and overlay URL; `TournamentModal` renders it.
- E2E compatibility: `/api/env` preserves `game_env` and now also exposes `env`; single-player start-button accessibility no longer collides with the "Starting gold" option.

**Verification:** focused pulse/readiness/tournament Vitest passed, TypeScript no-emit passed, touched-file ESLint passed, production build passed, mobile single-player E2E passed, and CI-style serial E2E passed with one flaky retry. Broad `npm test` still fails on 3 pre-existing/non-touched tests in `VaultFrontExecution` and `CoachHintEngine`.
