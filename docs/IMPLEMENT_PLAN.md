<!-- generated-by: /implement skill v1.0 -->
<!-- generated-at: 2026-05-18 -->
<!-- source-audit: docs/AUDIT_2026-05-18.md -->

# Implement Plan — VaultFront

## Sequenced Order

1. `startup-brief-repair` — restore protocol tooling before the rest of the pass.
2. `contract-hud-live-progress` — fix player-facing live feedback.
3. `coach-hint-site-signal` — ground AI hint input in real match state.
4. `stream-overlay-reconnect-memory` — improve spectator/streaming continuity.
5. `narrator-bus-token-guardrails` — reduce duplicate prompt load and improve late joins.
6. `anti-cheat-alert-cooldown` — bound moderation noise and memory growth.

## Test Plan

- `node scripts/render-startup-brief.mjs`
- `npx vitest run tests/client/components/ContractHudWidget.test.ts tests/client/graphics/layers/CoachHintEngine.test.ts tests/server/StreamingBus.test.ts tests/server/NarratorBus.test.ts tests/server/AntiCheatMonitor.test.ts`
- `npm run lint`
