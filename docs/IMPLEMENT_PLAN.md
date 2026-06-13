# Implement Plan — 2026-06-13 S69

Source: `docs/AUDIT_2026-06-13_S69.json`

## Optimal Sequence

1. `alpha-gate-passport` — foundational pulse contract upgrade; readiness and the KPI panel consume the same explicit alpha-gate pass/fail standard.
2. `kpi-alpha-gate-strip` — same observability surface; show alpha gate status and next missing check where testers already inspect VaultFront KPIs.
3. `s69-truth-sync` — context/status write-back after verification evidence is known, without claiming live tester or revenue evidence.

## Verification Plan

- `node --check src/server/VaultFrontPlaytestPulse.ts`
- `node --check src/server/VaultFrontReadiness.ts`
- `node --check src/client/Api.ts`
- `node --check src/client/graphics/layers/GameRightSidebar.ts`
- `npx vitest run tests/server/VaultFrontPlaytestPulse.test.ts tests/server/VaultFrontReadiness.test.ts tests/client/graphics/layers/GameRightSidebarVaultFeed.test.ts`
- `npm run build-prod`
- `npm test`
