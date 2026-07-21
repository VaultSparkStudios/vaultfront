# Session 76 Implementation Plan

Source: `docs/AUDIT_2026-07-20.json` (sole truth).

## Wave 4A — observability foundations

1. `context-usage-source-contract` — add a pure tokens/limit usage contract, wire the startup renderer, and cover arithmetic drift.
2. `sil-forecast-parser-honesty` — structurally parse current and legacy SIL entries, sort by actual session, and refuse evidence-free forecasts.

## Wave 4B — cross-surface release truth

3. `project-manifest-split-brain-guard` — compare status and generated manifest, repair the local snapshot, add fixtures, and prepare Ark evidence for the canonical source.
4. `public-footer-route-parity` — adopt the canonical non-vacuous route schema, enforce scoped nav/footer parity, update all leaf pages, and cover the prior false pass.

## Wave 4C — operator contract

5. `deploy-runbook-workflow-contract` — align staging, promotion, and rollback instructions with immutable workflow inputs and make documentation drift fail the deploy contract.

## Verification cadence

- Focused Vitest after each same-surface group.
- Direct script exits for project truth, footer, deploy contract, startup render, brief validation, doctor, and work exhaustion.
- Full lint, typecheck/build, Vitest, server repeat, and Playwright during closeout.
- No gameplay core-loop code is touched; the game-medium playtest hook gate is therefore not applicable. Operator-loop mappings remain recorded in the audit.
