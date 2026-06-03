# Implement Plan — 2026-06-03 Session 63 Audit

1. `playtest-pulse-command-center` — add a server-side alpha pulse model plus POST/summary endpoints.
2. `tutorial-retention-signal` — send tutorial shown/advance/skip/complete events into the pulse.
3. `tournament-streamer-brief` — add operations metadata to bracket views and render it in `TournamentModal`.
4. `readiness-pulse-evidence` — attach playtest pulse status to `/api/vaultfront/readiness`.

Verification:

- Focused Vitest: `npx vitest run tests/server/VaultFrontPlaytestPulse.test.ts tests/server/VaultFrontReadiness.test.ts tests/server/TournamentStoreOps.test.ts`.
- TypeScript: `.\\node_modules\\.bin\\tsc.cmd --noEmit`.
- Touched-file ESLint: `.\\node_modules\\.bin\\eslint.cmd ...`.
