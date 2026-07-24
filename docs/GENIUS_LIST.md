<!-- generated-by: scripts/generate-genius-list.mjs -->
<!-- generated-at: 2026-07-24T04:24:09.670Z -->

# Unified Genius List

Project: vaultfront
IGNIS source: latest-audit-sidecar

## 1. Make every scheduled public playlist actually run the VaultFront loop

**Tier:** 🔥 · **Axis:** feature depth / core loop / ux / soul fidelity · **Effort:** 3h · **Score:** 184

MapPlaylist returns FFA, team, special, and ranked public configs without vaultSitesEnabled or intelOperationsEnabled. Both default false, and GameRunner installs VaultFrontExecution only when either is true. Private and single-player paths explicitly enable them, proving the public omission is real.

Status: done
Recommended model: sonnet

## 2. Replace client-authoritative seasonal counters with a certified durable contract ledger

**Tier:** 🔥 · **Axis:** gamification / retention / security / progression · **Effort:** 8h · **Score:** 172

WinModal computes arbitrary deltas and POSTs them to an endpoint whose schema has no game identity, upper bounds, or replay protection. Worker adds those values to a process-local Map, allowing inflation and restart loss despite the project's certified progression posture.

Status: done
Recommended model: sonnet

## 3. Make the visible Season Pass a certified durable entitlement ledger

**Tier:** 🔥 · **Axis:** gamification / retention / security / progression · **Effort:** 8h · **Score:** 172

SeasonMilestoneStore is a process-local Map updated by the certified progression spine without game identifiers. Restarting erases progress and claims, replaying an outcome can double-count activity, and claim() only flips an in-memory boolean while the UI presents a title, badge, or gold-looking reward as earned. This is a second progression authority beside the durable certified contract ledger.

Status: done
Recommended model: sonnet

## 4. Turn VaultFront balance into a self-verifying release-bound envelope

**Tier:** 🔥 · **Axis:** feedback loop / observability / game depth / automation · **Effort:** 8h · **Score:** 162

GAMEPLAY_DESIGN declares itself authoritative, but the reward and cadence constants remain private fields spread through VaultFrontExecution and manually duplicated in prose. Property tests use Math.random and prove only a few relations. A plausible doc/code drift can therefore ship without a deterministic artifact showing fairness bounds, monotonicity, caps, mutator effects, or the exact tuning digest used by a release.

Status: done
Recommended model: sonnet

## 5. Measure the vault-to-convoy loop from certified game transitions instead of browser timestamps

**Tier:** 🔥 · **Axis:** feedback loop / observability / engagement / analytics · **Effort:** 8h · **Score:** 156

WinModal reconstructs early/mid/late phases from an unbound sessionStorage stream and Date.now minus match length. The stream is not game-scoped or cleared and counts UI commands rather than first-vault latency, convoy completion, interception, repeat cycles, or abandonment.

Status: done
Recommended model: sonnet

## 6. Separate the static health-route contract from a live runtime health observation

**Tier:** 🔥 · **Axis:** observability / release / security · **Effort:** 3h · **Score:** 148

generate-release-evidence regex-matches source for app.get('/_health'), stamps a fresh observedAt, and records status pass under healthEndpoint. That proves declaration, not reachability or a healthy deployment.

Status: done
Recommended model: sonnet

## 7. Turn Worker.ts into a composition root with bounded domain routers

**Tier:** ⚡ · **Axis:** speed / organization / security / testability · **Effort:** 6h · **Score:** 116

Worker.ts is roughly 4,000 physical lines and mixes identity, policy, readiness, experiments, AI, game lifecycle, clans, tournaments, progression, replay, and telemetry. This makes every route change a high-blast-radius edit and leaves many behaviors testable only through source scanning.

Status: done
Recommended model: sonnet

## 8. Extract the experiment control plane from Worker.ts behind one bounded router

**Tier:** ⚡ · **Axis:** speed / organization / security / testability · **Effort:** 6h · **Score:** 116

Worker.ts is 4,027 lines against a 4,040-line ceiling and still embeds dock, recap, runtime, and unified experiment routes with repeated identity, integrity, admin, and summary logic. The prior router extraction created the seam but left this high-churn control plane one small edit away from breaking the composition budget.

Status: done
Recommended model: sonnet

## 9. Complete the Prediction League as a reachable, restart-durable spectator loop

**Tier:** ⚡ · **Axis:** new feature / spectator engagement / retention / security · **Effort:** 8h · **Score:** 104

The leaderboard UI is reachable, but no client calls prediction-league/predict; a separate narrator crowd route accepts votes without adding them to league history. PredictionLeagueStore calls itself persistent while storing pending and history exclusively in Maps, so restarts erase the league.

Status: done
Recommended model: sonnet

## 10. Patch the direct protobuf parser denial-of-service advisory and ratchet CI

**Tier:** 🔥 · **Axis:** security / supply chain / automation · **Effort:** 1h · **Score:** 46

Live npm audit reports direct dependency protobufjs 7.6.3 inside the affected 7.5.0–7.6.4 range for GHSA-j3f2-48v5-ccww. A non-major 7.6.5 fix is available, but CI runs npm audit at high severity and therefore permits this known moderate availability risk indefinitely.

Status: done
Recommended model: sonnet
