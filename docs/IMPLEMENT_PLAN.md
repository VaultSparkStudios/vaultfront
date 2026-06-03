# Implement Plan — 2026-06-03 Audit

1. `launch-readiness-command-center` — add shared readiness payload and expose it from master and worker.
2. `tournament-bracket-ops` — add tournament seed/report controls to the existing modal.
3. `registered-test-surface` — update `PROJECT_STATUS.json` so `/start` shows real test surfaces.
4. `free-tier-revenue-discipline` — record internal/free-tier and revenue-signal posture in the same status contract and readiness endpoint.

Verification:

- `node --check` is not available for TypeScript; use `npx tsc --noEmit`.
- Run focused Vitest for touched server helper and client compile coverage via typecheck.
