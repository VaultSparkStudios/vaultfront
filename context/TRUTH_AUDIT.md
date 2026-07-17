<!-- truth-audit-version: 1.1 -->

# Truth Audit

Overall status: green
Last reviewed: 2026-07-16
Public-safe summary only. Sensitive verification notes are maintained privately.

## Protocol Genome — Session 74

| Dimension                 | Score | Evidence                                                                                                                   |
| ------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------- |
| Schema alignment          |     5 | Audit, innovation, release-evidence, project-status, and doctor payloads parse and validate against their local contracts. |
| Prompt/template alignment |     5 | The agent-neutral session protocol, active skill flow, Canon posture, and closeout ordering were followed.                 |
| Derived-view freshness    |     5 | Current state, task board, handoff, truth audit, SIL, and project status describe Session 74 evidence.                     |
| Handoff continuity        |     5 | The public-safe two-session handoff preserves S73 context and gives an evidence-bounded next move.                         |
| Contradiction density     |     4 | Local surfaces agree; central registry audience/type and release-gate shape still need the already-shipped Ark correction. |

**Genome total:** 24/25 — green. The one-point deduction is cross-repo metadata drift, not hidden local inconsistency.

## 2026-07-16 — Session 74

- Work truth: the latest audit sidecar contains 23/23 shipped entries, including 11 newly implemented findings; `docs/INNOVATION_PACK.json` contains 3/3 shipped innovations. `check-work-exhaustion.mjs` returns `ok: true` with no pending unblocked IDs.
- Authority truth: all inventoried state-changing HTTP routes cross the shared verified-actor policy; contract tests cover the route inventory and actor/role decisions. This does not claim native Obelisk relying-party integration.
- Experiment truth: assignment is server-owned; accepted values are literal unit events with UUID identity and deduplication; invalid/duplicate/spoofed attempts are counted separately.
- Health truth: readiness is process-local and derives from HTTP, IPC freshness, and game-loop freshness. WebSocket payload, IP, spectator, worker, and buffered-byte limits are explicit policy values.
- Remote-AI truth: reservations are placed only after authentication, validation, and cache lookup, immediately before provider-bound work. Posture explicitly says `process-local-per-worker`; counters are not a global distributed quota.
- Build truth: TypeScript and warning-free Vite production build pass. Actual initial entry transfer is 738,884 bytes gzip and 586,665 bytes Brotli; media aggregate and largest-artifact budgets pass. The Release Evidence Manifest reports transfer pass and audit/innovation exhaustion.
- Test truth: the broad run passes 122 files / 762 unique tests; the server subset independently repeats 25 files / 90 tests; Playwright passes 22/22 desktop/mobile tests with two bounded local workers.
- Tooling truth: project doctor runs four real checks with `blockingFailing: 0`; formatting ratchet and lint pass after touched-file correction; sitemap compliance is 10/10 and Canon conformance reports zero gaps/zero absolute gaps.
- Security truth: settings sanitization found zero issues. The full-tree entropy scanner reports low-confidence false positives in inherited binary/base64 assets, so it is not claimed green; the authoritative staged-diff scan passed with zero findings.
- Release truth: public launch remains NO-GO. Studio Ops `release-gate` currently throws because registry `testing` is not an array, web hardening sees zero public origins, and the central cost gate still calls this project `exempt-internal`; signed Ark cargo requests control-plane correction. No sibling repo was edited.
- SIL truth: 968/1000 is the exact sum of 10 categories. Engagement and ecosystem scores remain bounded by absent real-human and external integration evidence.

## 2026-07-16 — Session 73

- Audit truth: all 12 items in `docs/AUDIT_2026-07-16.json` are marked shipped with per-item execution evidence; the Markdown audit is derived from that JSON. All 3 second-order innovation candidates are evidence-detected complete.
- Test truth: the final coverage run passed 107/107 files and 697/697 tests. The exact single-worker CI Playwright profile passed 22/22 desktop/mobile tests. A faster six-worker local stress run had two cold-start timeouts; both passed immediately in isolation and the canonical CI profile passed without retry.
- Build truth: TypeScript and Vite 7 production build pass. Every emitted JavaScript chunk is below 500 kB gzip under the dependency-free bundle gate. Remaining warnings are explicit: public URL placeholders are unset before deployment, two JSON import-attribute inconsistencies remain, and the manual chunk layout reports one circular-chunk warning.
- Security truth: authenticated/deduplicated source-labeled Alpha Gate evidence, fail-closed signed replay consumption, and authenticated sanitized rematch creation are covered. `npm audit` reports zero vulnerabilities after exact trust-gated updates; Studio supply-chain scan reports zero matching incidents.
- Cost truth: remote AI is default-off and requires an explicit positive hourly cap with feature attribution. Deterministic coaching remains the cost-neutral baseline.
- Public truth: local sitemap compliance is 10/10 and public/AI-agent/legal/contact surfaces exist, but this does not prove live hosting, email delivery, headers, Core Web Vitals, or theme readability.
- Canon/doctor truth: conformance reports 49 applicable Canon, zero gaps, and zero absolute gaps. Studio doctor reports `overallPass: true`, 112 passing, 33 advisory warnings, zero failing, and `blockingFailing: 0`.
- Profile truth: local status is `game/public-unlaunched`; signed Ark cargo `01JTM66B6TEE83C483CEB936FA` requests the registry type correction from `app` to `game`. No direct sibling-repo edit was made.
- Launch truth: no human Alpha Gate, staging parity, project-domain Brevo delivery, native Obelisk relying-party auth, live CSP/HSTS/Core Web Vitals/theme screenshot evidence, revenue event, or founder approval is claimed.
- SIL truth: score is recalibrated from an unsupported 999 to evidence-based 943/1000. The decrease is an honesty correction, not a product regression.

## 2026-07-16

- Recovery provenance: the immediate prior run stopped during `/start`; the inherited dirty layer matched a June 18 `lint-staged` recovery stash plus later Studio protocol propagation. No new audit or implementation had begun.
- Integrity truth: changed/untracked JSON parses; 53 changed/untracked scripts pass `node --check`; the Studio Claude-config guard reports valid configuration and zero corruption events in the prior 24 hours.
- Obelisk truth: the committed React `.tsx` helper was unreferenced and incompatible with this Lit project, failing TypeScript because React/JSX are not configured. All deployable Obelisk stubs were removed; `obelisk-passport/` remains local and ignored after being untracked.
- Verification truth: direct `npm test` passes 94 main files / 655 tests plus 10 server files / 30 tests. Studio doctor reports `overallPass: true`, 115 passing, 25 advisory warnings, 2 expected skips, and `blockingFailing: 0`. The local staging build initially failed on the React stub, proving the earlier build claim stale; the repaired local staging gate now passes `npm run build-prod` with TypeScript clean.
- Commit-gate truth: the recovery pre-commit hook initially reproduced three inherited lint failures; Obelisk TTL fallback, ANSI stripping, and CommonJS script lint configuration were fixed at source with focused ESLint green and no hook bypass.
- Sanitization truth: `docs/RIGHTS_PROVENANCE.md` is preserved locally but untracked/ignored; the root AGPL-3.0 `LICENSE` remains public and the upstream copyleft obligation is unchanged.
- Residual truth: live rivalry/rematch playtest evidence, observed revenue, production Obelisk relying-party registration, and route/server verification remain unclaimed.

## 2026-06-14

- `docs/AUDIT_2026-06-14_S71.md` and JSON sidecar match shipped protocol helper guard changes and mark all 3 items shipped.
- Studio protocol truth: `tests/scripts/StudioProtocolHelpers.test.ts` covers stale startup brief rejection, per-tile budget attribution/trimming, and secrets-gateway capability readiness.
- PROJECT_STATUS invariant truth: `scripts/lib/write-project-status.mjs --check` passes after restoring the shared SIL v3 category list in `scripts/lib/sil-categories.mjs`.
- Obelisk truth: generated `obelisk-passport/` stubs remain local/ignored until production relying-party origin registration and deliberate auth wiring.
- Broad test evidence is now 94 main test files / 655 tests plus 10 server test files / 30 tests.
- `npm run build-prod` passes; known non-blocking warnings remain for public URL placeholders, mixed JSON import attributes, large chunks, and Node tooling deprecation.
- Revenue signal remains unverified until live checkout/supporter telemetry is observed.

- `docs/AUDIT_2026-06-14.md` and JSON sidecar match shipped code/test changes and mark all 3 items shipped.
- Alpha Gate runbook truth: `VaultFrontAlphaGateRunbook` turns pulse/readiness payloads into checklist, success criteria, evidence fields, and warnings without clearing revenue evidence.
- Readiness truth: playtest-pulse evidence now includes the alpha gate pass label in warning and pass branches.
- Studio protocol truth: `generate-genius-list.mjs --json` has focused regression coverage for done-item semantics and human-blocked live-evidence gates.
- Broad test evidence is now 93 main test files / 652 tests plus 10 server test files / 30 tests.
- `npm run build-prod` passes; known non-blocking warnings remain for public URL placeholders, mixed JSON import attributes, large chunks, and Node tooling deprecation.
- Revenue signal remains unverified until live checkout/supporter telemetry is observed.

## 2026-06-13

- `docs/AUDIT_2026-06-13_S69.md` and JSON sidecar match shipped code/test changes and mark the 2 product items plus truth sync shipped.
- Playtest pulse truth: summary payloads now include `alphaGate` with freshness, tutorial, feedback, Rival exposure, and Rival action checks.
- Readiness truth: a ready pulse score now remains warning-level unless the attached alpha gate is also ready.
- KPI tile truth: the Playtest Pulse tile now renders Alpha Gate status and the next missing check.
- Broad test evidence is now 91 main test files / 647 tests plus 9 server test files / 27 tests.
- `npm run build-prod` passes; known non-blocking warnings remain for public URL placeholders, mixed JSON import attributes, large chunks, and Node tooling deprecation.
- Revenue signal remains unverified until live checkout/supporter telemetry is observed.

## 2026-06-07

- `docs/AUDIT_2026-06-07_S68.md` and JSON sidecar match shipped code/test changes and mark the 2 product items shipped.
- Playtest pulse truth: summary payloads now include `operatorNext` with headline, steps, and successMetric derived from the same pulse counters used by readiness.
- KPI tile truth: the Playtest Pulse tile now renders Rival Challenge action conversion, latest signal age, and `operatorNext.headline`.
- Broad test evidence is now 91 main test files / 645 tests plus 9 server test files / 25 tests.
- `npm run build-prod` passes; known non-blocking warnings remain for public URL placeholders, mixed JSON import attributes, large chunks, and Node tooling deprecation.
- `PROJECT_STATUS.silScore` is 998 and matches the sum of `silCategoriesV3`.
- Revenue signal remains unverified until live checkout/supporter telemetry is observed.
- `docs/AUDIT_2026-06-07_S67.md` and JSON sidecar match shipped code/test changes and mark all 4 items shipped.
- Playtest pulse truth: summary totals/rates now include tutorial advancement, match feedback, and Rival Challenge retention conversion counters.
- Readiness truth: playtest-pulse evidence includes the first action insight, so launch-gate warnings name the next playtest action.
- Broad test evidence is now 91 main test files / 643 tests plus 9 server test files / 24 tests.
- `npm run build-prod` passes; known non-blocking warnings remain for public URL placeholders, mixed JSON import attributes, and large chunks.
- `PROJECT_STATUS.silScore` is 998 and matches the sum of `silCategoriesV3`; the helper validation command hit an intermittent Windows sandbox `CryptUnprotectData` error during closeout, so this invariant was verified from the JSON fields directly.
- Revenue signal remains unverified until live checkout/supporter telemetry is observed.

## 2026-06-05

- `docs/AUDIT_2026-06-05_S66.md` and JSON sidecar match shipped code/test changes and mark all 4 items shipped.
- Startup helper-chain truth: `node scripts/compact-handoff.mjs` and `node scripts/render-startup-brief.mjs` now pass after restoring missing helper modules.
- Broad test evidence is now 91 main test files / 640 tests plus 9 server test files / 23 tests.
- `npm run build-prod` passes; known non-blocking warnings remain for public URL placeholders, mixed JSON import attributes, and large chunks.
- `PROJECT_STATUS.silScore` is 998 and matches the sum of `silCategoriesV3`.
- `.ops-cache/` is ignored with `.cache/` so generated handoff cache does not create false dirty-worktree signals.
- `docs/AUDIT_2026-06-05_S65.md` and JSON sidecar match shipped code/test changes and mark all 4 items shipped.
- Fresh Codex closeout verification passed: blocker script syntax checks, blocker-preflight rendering, readiness focused Vitest (4 tests), production build, and broad `npm test`.
- Broad test evidence is now 90 main test files / 638 tests plus 9 server test files / 23 tests.
- Generated `.cache/` and `ignis/output/` artifacts are ignored so they do not create false dirty-worktree signals during session protocol runs.
- Known non-blocking warnings remain: Vite public URL placeholders, mixed JSON import attributes, large chunks, and expected test stderr paths.
- Revenue signal remains unverified until live checkout/supporter telemetry is observed.

## 2026-06-04

- `docs/AUDIT_2026-06-04_S64.md` and JSON sidecar match shipped code/test changes.
- All 90 Vitest test files (637 tests) pass — broad `npm test` is now fully green. Previous 3 pre-existing failures (VaultFrontExecution mock staleness, VaultFrontLifecycle BigInt, CoachHintEngine trigger field) are repaired.
- `tsc --noEmit` clean; `npm run build-prod` green (Vite bundled in 13.4s); touched-file ESLint clean.
- Entropy: 0.08 (healthy, computed and written to PROJECT_STATUS.json).
- Session 65 truth sync: `PROJECT_STATUS.silScore` now matches the latest public-safe Session 65 estimate (997), and test evidence now says 638 tests instead of stale 634/637.
- Revenue signal remains unverified. The readiness/startup code can now clear the warning only when explicit observed/verified evidence is supplied; it must not clear on `unverified`.
- Truth status upgraded from amber-green to green — all major verification surfaces are now clean.

## 2026-06-03

- `docs/AUDIT_2026-06-03_S63.md` and JSON sidecar match shipped code/test changes.
- `npm run build-prod` passes; CI-style serial `npm run e2e` passes with one flaky retry.
- Focused pulse/readiness/tournament tests pass; `tsc --noEmit` and touched-file ESLint pass.
- Broad `npm test` is not green due 3 residual non-touched failures in `VaultFrontExecution` and `CoachHintEngine`; project status should not claim full unit surface green until repaired.

## 2026-05-18

- `docs/AUDIT_2026-05-18.md` matches shipped code/test changes.
- Startup brief regenerated successfully after helper repair.
- Full lint/build are not green yet due unrelated pre-existing blockers; focused modified-file checks passed.
