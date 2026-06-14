<!-- truth-audit-version: 1.1 -->

# Truth Audit

Overall status: green
Last reviewed: 2026-06-14
Public-safe summary only. Sensitive verification notes are maintained privately.

## 2026-06-14

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
