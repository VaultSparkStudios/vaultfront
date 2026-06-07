# Implement Plan — 2026-06-07 S67

Source: `docs/AUDIT_2026-06-07_S67.json`

## Optimal Sequence

1. `playtest-pulse-funnel-breakdown` — foundational server/client schema upgrade; readiness and retention evidence depend on the expanded pulse contract.
2. `rival-challenge-retention-telemetry` — same post-match surface, now measurable through the pulse funnel without adding paid AI calls.
3. `readiness-pulse-action-insights` — folds the stronger pulse into launch-gate evidence so operators get a next action, not just a score.
4. `s67-truth-sync` — context/status write-back after verification evidence is known.

## Verification Plan

- `node --check src/server/VaultFrontPlaytestPulse.ts`
- `node --check src/server/VaultFrontReadiness.ts`
- `node --check src/client/Api.ts`
- `node --check src/client/graphics/layers/WinModal.ts`
- `npx vitest run tests/server/VaultFrontPlaytestPulse.test.ts tests/server/VaultFrontReadiness.test.ts tests/client/graphics/layers/WinModal.test.ts`
- `npm run build-prod`
- `node scripts/lib/write-project-status.mjs --check`
- `npm test`
