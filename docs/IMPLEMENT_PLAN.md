# Implement Plan — 2026-06-05 S66

Source: `docs/AUDIT_2026-06-05_S66.json`

## Optimal Sequence

1. `startup-turn-classifier-restore` — foundational protocol repair; unblocks startup/compact probes and token routing.
2. `mobile-tutorial-smoke-gate` — same onboarding surface as S65, now protected by automated mobile-width evidence.
3. `rival-challenge-postmatch-loop` — retention feature on existing post-match/rivalry state with no paid AI expansion.
4. `s66-truth-sync` — context/status write-back after verification evidence is known.

## Verification Plan

- `node --check scripts/lib/turn-classifier.mjs`
- `node scripts/compact-handoff.mjs`
- `node scripts/render-startup-brief.mjs`
- `npx vitest run tests/client/VaultFrontTutorial.test.ts tests/client/graphics/layers/WinModal.test.ts`
- `npm run build-prod`
- `node scripts/lib/write-project-status.mjs --check`
