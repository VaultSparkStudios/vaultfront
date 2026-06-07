# Implement Plan — 2026-06-07 S68

Source: `docs/AUDIT_2026-06-07_S68.json`

## Optimal Sequence

1. `operator-next-playtest-script` — foundational pulse contract upgrade; readiness, KPI operator text, and the next internal playtest all consume the same script.
2. `kpi-rival-conversion-tile` — same observability surface; show Rival Challenge action conversion and signal age where testers already inspect VaultFront KPIs.
3. `s68-truth-sync` — context/status write-back after verification evidence is known.

## Verification Plan

- `node --check src/server/VaultFrontPlaytestPulse.ts`
- `node --check src/client/Api.ts`
- `node --check src/client/graphics/layers/GameRightSidebar.ts`
- `npx vitest run tests/server/VaultFrontPlaytestPulse.test.ts tests/client/graphics/layers/GameRightSidebarVaultFeed.test.ts`
- `npm run build-prod`
- `npm test`
