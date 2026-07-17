# Current State

Public-safe summary:

- this repo remains deployable
- internal operational records were sanitized for public-repo safety on 2026-04-03
- detailed internal state now lives in the private Studio OS / ops repository

## 2026-07-16 — Session 74 Saturated Integrity Arc Complete

Completed one uninterrupted `/start → /audit → /implement → /closeout` mission against live code. Eleven newly verified findings shipped, every one of the 23 entries in `docs/AUDIT_2026-07-16.json` is now shipped, and all three evidence-derived second-order innovations are complete.

**Authority and runtime integrity shipped:**

- Every state-changing HTTP route now crosses a server-authoritative actor boundary with claim/role checks; private-lobby start, progression, clan, tutorial, prediction, and tournament mutations have contract coverage.
- Experiment events now use server-owned assignment, UUID event identity, deduplication, literal unit values, and explicit rejection telemetry.
- WebSocket services enforce payload, connection, spectator, and slow-consumer budgets; readiness derives from live HTTP, inter-process communication, and game-loop freshness.
- Remote artificial intelligence reservations happen only after authentication, validation, and cache lookup, immediately before provider-bound work; posture declares its process-local-per-worker scope.

**Truth and release evidence shipped:**

- The project doctor executes real probes, preserves child exit codes, reports `blockingFailing`, and includes an exhaustion probe.
- The Unified Genius List derives from the latest versioned audit sidecar instead of a stale hard-coded source.
- A Runtime Integrity Passport signs a canonical snapshot of mutation, experiment, worker-health, WebSocket, and remote-AI posture.
- A Release Evidence Manifest binds Git state, launch mode, audit/innovation exhaustion, and exact transfer measurements into a digestible build artifact.
- Production release surfaces now use complete shared security headers, honest FORGE/Join Alpha copy, revision-bound container promotion, and cycle-free warning-free client chunks.
- Observability rejects high-cardinality identifiers, and the bundle gate measures the actual initial graph in both gzip and Brotli plus total/largest media budgets.

**Verification:** 122/122 Vitest files and 762/762 unique tests pass; the server subset independently repeats 25 files / 90 tests; Playwright passes 22/22 desktop/mobile tests with two bounded workers; lint, typecheck, warning-free production build, formatting ratchet, exact bundle budgets, sitemap 10/10, Canon conformance (zero gaps), and project doctor (`blockingFailing: 0`) pass. Work exhaustion reports audit 23/23 and innovations 3/3 shipped.

**Honesty boundary:** VaultFront remains FORGE / `public-unlaunched`. The control-plane release-gate command currently crashes on registry `testing` shape and the registry still misclassifies this project as internal; both were reported through signed Ark cargo rather than cross-repo edits. No staging deployment, distinct-human Alpha Gate, Brevo delivery, native Obelisk relying-party authentication, live header/Core Web Vitals/theme evidence, revenue event, or founder launch approval is claimed.

## 2026-07-16 — Session 73 Recovery-to-Arc Mission Complete

Recovered the interrupted S72 boundary, checkpointed it independently, and then completed the full `/start → /audit → /implement → /closeout` product mission without converting local evidence into launch claims.

**Product and trust systems shipped:**

- Authenticated, pseudonymous, deduplicated Alpha Gate evidence now distinguishes human, agent, and test sources; only three or more distinct human sessions can satisfy the human evidence gate.
- Replay consumption verifies signatures fail-closed outside development/test, and authenticated rematch requests now create real private lobbies instead of UI-only retention events.
- Vault Pressure turns three successful deliveries into a 90-second breach window whose next delivery is decisive; expiry rolls pressure back to two, with HUD and telemetry coverage.
- The tactical coach now has seven deterministic local triggers, while optional remote enhancement is explicit, attributed, default-off, and bounded by a positive hourly cap.
- Match outcomes now feed an idempotent server-authoritative progression spine with Elo, history, season, achievements, and a mounted Progression Debrief.
- Readiness separates declared from verified evidence and reports server status, release status, warnings, and remaining launch gates without false-green inference.

**Engineering and public surface shipped:**

- CI now enforces coverage, shrink-only formatting, dependency-free bundle budgets, and robust local-stack E2E defaults; all emitted JavaScript chunks are below 500 kB gzip.
- Exact trust-gated dependency updates and transitive remediation reduced `npm audit` from 34 findings to zero; the Studio supply-chain incident scan found no matches.
- Public sitemap, legal, contact, documentation, AI-agent, footer, JSON-LD, and upstream-attribution surfaces now score 10/10 in the local sitemap compliance audit.
- Recovery provenance, prompt/initiate separation, CANON-044 task structure, audit JSON/Markdown derivation, and second-order innovation evidence now have deterministic tests.

**Verification:** 107/107 Vitest files and 697/697 tests pass with coverage ratchets green; exact CI-profile Playwright passes 22/22; production TypeScript/Vite build, ESLint, formatting ratchet, bundle budgets, npm audit, supply-chain scan, sitemap compliance, Canon conformance, and Studio doctor all pass. Studio doctor reports `overallPass: true`, `failing: 0`, and `blockingFailing: 0`.

**Honesty boundary:** lifecycle remains `public-unlaunched` / FORGE. Human alpha evidence, staging parity, project-domain Brevo delivery, native Obelisk relying-party auth, live web-header/Core Web Vitals/theme evidence, and founder launch approval remain release gates rather than claimed accomplishments.

## 2026-07-16 — Session 72 Interrupted-State Recovery Complete

Recovered the post-Session-71 dirty tree and restored a clean, evidence-backed session boundary before beginning new product work.

**Recovered work:**

- Preserved the validated Studio protocol propagation set, including Windows child-process hiding, shared doctor/blocker/context policies, Canon adoption tracking, and Dependabot automation.
- Removed all unreferenced generated Obelisk helpers from deployable `src/`; the React `.tsx` stub was incompatible with this Lit project and broke TypeScript production builds.
- Untracked the generated `obelisk-passport/` reference cargo while retaining it locally behind `.gitignore`, making the existing quarantine claim real.
- Refreshed public-safe startup, handoff, status, truth, and closeout surfaces for the recovered Session 72 boundary.
- Restored the canonical local `scripts/scan-secrets.mjs` helper so staged security scans target VaultFront rather than the control-plane repository.
- Repaired the inherited `lint-staged` blockers in Obelisk TTL fallback, ANSI stripping, and CommonJS script lint configuration; focused ESLint now passes without bypass.
- Preserved `docs/RIGHTS_PROVENANCE.md` locally but untracked/ignored it to clear the public-repo private-document sanitization gate; the root AGPL-3.0 `LICENSE` remains tracked.

**Verification:** all changed/untracked JSON parses; `~/.claude.json` and settings pass the Studio guard with zero recent corruption; 53 changed/untracked scripts pass `node --check`; broad `npm test` passes 94 files / 655 tests plus the dedicated 10 server files / 30 tests; Studio doctor reports `overallPass: true` and `blockingFailing: 0`. The first staging build exposed the incompatible React stub; after quarantine repair, `npm run build-prod` passes with TypeScript clean and only the known non-blocking Vite warnings.

**Honesty boundary:** this recovery did not claim a live rivalry/rematch playtest, observed revenue, route-wired Obelisk login, or production relying-party readiness.

## 2026-06-14 — Session 71 Protocol Helper Guard Pass Complete

Shipped all 3 items from `docs/AUDIT_2026-06-14_S71.md`.

**New fixes added:**

- Added `tests/scripts/StudioProtocolHelpers.test.ts`, covering stale startup brief rejection, per-tile brief budget attribution/trimming, and secrets-gateway capability readiness through an isolated temporary secrets directory.
- Restored `scripts/lib/sil-categories.mjs`, the shared SIL v3 category list required by `scripts/lib/write-project-status.mjs --check`.
- Quarantined generated `obelisk-passport/` relying-party stubs in `.gitignore` until production origin registration and deliberate login/callback/server verification wiring exist.
- Regenerated the startup brief and compact handoff after the protocol helper refresh; startup validation remains conformant with only the known recommended HUMAN PRESSURE warning.
- `PROJECT_STATUS` now reflects the S71 focus and 655 broad passing tests plus 30 server tests.

**Verification:** changed Studio helper scripts passed `node --check`; focused Vitest passed 5 tests across Studio protocol and `/go` helper coverage; `node scripts/render-startup-brief.mjs`, `node scripts/validate-brief-format.mjs docs/STARTUP_BRIEF.md`, `node scripts/compact-handoff.mjs`, `node scripts/check-secrets.mjs --audit --json`, `node scripts/blocker-preflight.mjs --json`, and `node scripts/lib/write-project-status.mjs --check` passed; `npm test` is green (94 files / 655 tests, plus 10 server files / 30 tests); `npm run build-prod` is green. Remaining evidence warnings are intentional: real rivalry/rematch playtest evidence and real checkout/supporter telemetry are still not observed.

## 2026-06-14 — Session 70 Audit + Implement Pass Complete

Shipped all 3 items from `docs/AUDIT_2026-06-14.md`.

**New fixes added:**

- Added `VaultFrontAlphaGateRunbook`, a structured operator runbook helper that turns playtest pulse + readiness data into a checklist, success criteria, evidence fields, and warnings.
- Readiness playtest-pulse launch-gate evidence now includes the `alphaGate.passLabel`, so warning/pass branches explain the standard being applied.
- Added Studio `/go` helper regression coverage for `generate-genius-list.mjs --json`, including done-item semantics and human-blocked live-evidence gates.
- `PROJECT_STATUS` now reflects the S70 focus and 652 broad passing tests plus 30 server tests.

**Verification:** `node --check scripts/generate-genius-list.mjs`; `npx tsc --noEmit`; focused Vitest passed 10 tests across runbook/readiness/go-helper coverage; `npm run build-prod` is green; broad `npm test` is green (93 files / 652 tests, plus 10 server files / 30 tests). Remaining evidence warnings are intentional: real rivalry/rematch playtest evidence and real checkout/supporter telemetry are still not observed.

## 2026-06-14 — Session 70 /go Protocol Repair + Verification Pass Complete

Shipped the `/go` protocol repair from the approved plan and executed the refreshed unblocked verification list.

**New fixes added:**

- Restored the missing public-repo `/go` helper chain: `generate-genius-list`, `cache-genius-list`, `set-active-skill`, and `innovation-pack`.
- `scripts/ops.mjs genius-list` now writes `.cache/genius-list.json` and `docs/GENIUS_LIST.md`, allowing startup briefs to embed a real Genius Hit List again.
- Recreated `context/.session-lock` for the active Codex session and regenerated `docs/STARTUP_BRIEF.md`.
- Synced the Session 70 Unified Genius List into `TASK_BOARD` append-only and marked the four unblocked verification items done.

**Verification:** helper syntax checks passed; focused Alpha Gate Vitest passed 14 tests; startup brief validation is conformant with only the existing recommended `HUMAN PRESSURE` warning; `npm run build-prod` is green; broad `npm test` is green (91 files / 647 tests, plus 9 server files / 27 tests). Remaining evidence warnings are intentional: real rivalry/rematch playtest evidence and real checkout/supporter telemetry are still not observed.

## 2026-06-13 — Session 69 Alpha Gate Passport Pass Complete

Shipped 2 product items plus truth sync from `docs/AUDIT_2026-06-13_S69.md`.

**New fixes added:**

- Playtest pulse summaries now include an `alphaGate` contract with pass/fail status, five concrete checks, a pass label, and the next missing check.
- Readiness now treats a ready pulse score as warning-level when the attached alpha gate is still warming or blocked.
- The in-game KPI Playtest Pulse tile now shows Alpha Gate status and the next missing check, keeping the live alpha standard visible during playtests.
- `PROJECT_STATUS` now reflects Session 69 focus and 647 broad passing tests plus 27 server tests.

**Verification:** syntax checks passed for `VaultFrontPlaytestPulse`, `VaultFrontReadiness`, `Api`, and `GameRightSidebar`; focused Vitest passed 14 tests across pulse/readiness/sidebar coverage; `npm run build-prod` is green; broad `npm test` is green (91 files / 647 tests, plus 9 server files / 27 tests). Existing non-blocking warnings remain: Vite public URL placeholders, mixed JSON import attributes, large chunks, Lit dev-mode stderr, expected test stderr, and a Node tooling deprecation warning.

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
