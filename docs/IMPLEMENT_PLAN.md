# Session 81 Implementation Plan

Source: `docs/AUDIT_2026-07-23.json`

## Wave 3A — Restore the flagship path and truth boundary

1. `public-playlist-vaultfront-loop-contract` — restore the VaultFront execution contract in every scheduled public playlist and ratchet it with integration tests.
2. `runtime-health-observation-truth` — separate source-declared health capability from a provenance-bearing live observation.

## Wave 3B — Certified progression and feedback

3. `certified-season-contract-ledger` — build the durable match-certified progression store first because the later routers and prediction loop reuse its dependency-injection and persistence pattern.
4. `certified-loop-funnel-evidence` — derive match-bound loop evidence from authoritative server state and retire the browser-authored funnel mutation.

## Wave 3C — Spectator loop and composition

5. `durable-reachable-prediction-league` — complete one authenticated, persistent prediction path resolved by the certified match outcome.
6. `bounded-worker-router-composition` — reconcile the extracted season, loop-evidence, and prediction routers; add policy/composition tests and a non-regression budget.

## Wave 3D — Saturation

7. Refresh the Unified Genius List and run the innovation pack.
8. Implement every locally shippable second-order candidate and explicitly evidence any external-only boundary.
9. Run the work-exhaustion verifier and session-floor gate; continue until both prove exhaustion.

Every item is complete only after its behavior and relevant test surface pass. Partial work is recorded as blocked, never shipped.
