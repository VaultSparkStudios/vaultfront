# Implement Plan — 2026-06-05 S65

Source: `docs/AUDIT_2026-06-05_S65.json`

| Order | Slug                                  | Effort | Priority | Rationale                                                                                   |
| ----: | ------------------------------------- | -----: | -------: | ------------------------------------------------------------------------------------------- |
|     1 | `blocker-preflight-attempt-order`     |    30m |     19.9 | Protocol correctness first; fixes start/closeout evidence readability.                      |
|     2 | `project-status-truth-sync`           |    30m |     17.4 | Machine-readable truth source must match latest shipped state before rendering new briefs.  |
|     3 | `readiness-revenue-observer-contract` |     1h |     22.1 | Readiness contract affects promotion gates and startup signal quality.                      |
|     4 | `mobile-tutorial-compact-strip`       |     2h |     28.0 | Highest user-facing impact; depends only on client tutorial surface and existing telemetry. |

## Verification

- `node scripts/ops.mjs blocker-preflight`
- `npx vitest run tests/server/VaultFrontReadiness.test.ts`
- `node --check scripts/blocker-preflight.mjs`
- `node --check scripts/lib/blocker-rules.mjs`
- `npm run build-prod`
