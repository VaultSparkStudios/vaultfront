# Implement Plan — 2026-06-14 S70

Source: `docs/AUDIT_2026-06-14.json`

## Optimal Sequence

1. `alpha-gate-operator-runbook` — creates the structured operator artifact consumed by real playtest execution and future UI/readiness surfaces.
2. `readiness-alpha-evidence-copy` — tightens the readiness evidence sentence while the runbook context is loaded.
3. `go-helper-regression-smoke` — locks the repaired `/go` helper behavior so future startup sessions cannot regress to an empty or dishonest Genius Hit List.

## Verification Plan

- `node --check src/server/VaultFrontReadiness.ts`
- `node --check scripts/generate-genius-list.mjs`
- `npx tsc --noEmit`
- `npx vitest run tests/server/VaultFrontAlphaGateRunbook.test.ts tests/server/VaultFrontReadiness.test.ts tests/scripts/StudioGoHelpers.test.ts`
- `npm run build-prod`
- `npm test`
