# Implement Plan — 2026-06-14 S71

Source audit: `docs/AUDIT_2026-06-14_S71.json`

## Wave Plan

| Order | Slug                                 | Rung | Why first                                                                                          |
| ----: | ------------------------------------ | ---- | -------------------------------------------------------------------------------------------------- |
|     1 | `obelisk-passport-quarantine`        | L2   | Lowest-risk security/process fix; prevents generated auth cargo from being accidentally committed. |
|     2 | `protocol-helper-regression-harness` | L2   | Locks the broad protocol helper refresh behind focused tests before broader verification.          |
|     3 | `s71-truth-sync`                     | L2   | Must happen after verification so public-safe context files describe evidence rather than intent.  |

## Verification Plan

- `node --check` on changed Studio helper scripts.
- `npx vitest run tests/scripts/StudioProtocolHelpers.test.ts tests/scripts/StudioGoHelpers.test.ts`
- `node scripts/render-startup-brief.mjs`
- `node scripts/validate-brief-format.mjs docs/STARTUP_BRIEF.md`
- `node scripts/compact-handoff.mjs`
- `node scripts/check-secrets.mjs --audit --json`
- `node scripts/lib/write-project-status.mjs --check`
