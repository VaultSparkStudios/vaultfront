<!-- generated-by: scripts/generate-genius-list.mjs -->
<!-- generated-at: 2026-07-19T20:08:52.499Z -->

# Unified Genius List

Project: vaultfront
IGNIS source: latest-audit-sidecar

## 1. Make every progression, clan, tournament, and private-lobby mutation server-authoritative

**Tier:** 🔥 · **Axis:** security / correctness / architecture · **Effort:** 8h · **Score:** 92

Multiple Worker routes trust caller-supplied persistentId/founderId/createdBy values, and any holder of a private game ID can start the lobby.

Status: done
Recommended model: sonnet

## 2. Make A/B evidence assignment-owned, unit-weighted, and replay-safe

**Tier:** 🔥 · **Axis:** security / observability / feedback_loop · **Effort:** 4h · **Score:** 86

Dock, recap, and runtime event routes accept client-selected variants and values up to 10,000, invalidating experiment decisions.

Status: done
Recommended model: sonnet

## 3. Make one canonical result certificate the only input to progression, telemetry, and archives

**Tier:** 🔥 · **Axis:** security / correctness / gamification / innovation · **Effort:** 10h · **Score:** 84

GameServer accepts client-supplied winner and allPlayersStats at a non-strict 50% IP quorum, then advances durable systems from the first matching payload.

Status: done
Recommended model: sonnet

## 4. Bound WebSocket payload, connection, and slow-consumer memory

**Tier:** 🔥 · **Axis:** security / performance / reliability · **Effort:** 4h · **Score:** 82

Three noServer WebSocket servers inherit a 100 MiB maxPayload and spectator fan-out has no bufferedAmount ceiling.

Status: done
Recommended model: sonnet

## 5. Derive worker readiness from live IPC, HTTP, and game-loop watermarks

**Tier:** 🔥 · **Axis:** observability / reliability / truth · **Effort:** 3h · **Score:** 80

Worker readiness currently passes healthy:true while experiment and alpha evidence are process-local and volatile.

Status: done
Recommended model: sonnet

## 6. Replace the zero-exit doctor stub with a real project health contract

**Tier:** 🔥 · **Axis:** process / automation / observability · **Effort:** 3h · **Score:** 78

scripts/ops.mjs doctor prints a context-meter hint and exits 0 without tests, probes, or blockingFailing.

Status: done
Recommended model: sonnet

## 7. Replace forgeable process-global Alpha Gate counters with session-scoped evidence

**Tier:** 🔥 · **Axis:** feedback_loop / security / innovation · **Effort:** 3h · **Score:** 78

The unauthenticated POST accepts caller-selected weights and synthetic events can turn the gate green.

Status: done
Recommended model: sonnet

## 8. Drive the genius list and closeout hint from the latest audit schema

**Tier:** 🔥 · **Axis:** process / ranking / continuity · **Effort:** 2.5h · **Score:** 76

The generator reads an obsolete hardcoded June audit and the closeout renderer reads cache.list.ranked while the generator writes top-level items.

Status: done
Recommended model: sonnet

## 9. Model every canonical release gate and make footer and health evidence executable

**Tier:** 🔥 · **Axis:** truth / release / ux / ecosystem · **Effort:** 5h · **Score:** 71

Readiness can report ready without staging, parity, Brevo, Obelisk, live web/theme proof, or approval; missing alphaGate passes; leaf footers are incomplete; no footer manifest exists; protocol health path is absent.

Status: done
Recommended model: sonnet

## 10. Make headers, public CTAs, container artifacts, and promotion provenance agree

**Tier:** 🔥 · **Axis:** security / release / dual_audience · **Effort:** 5h · **Score:** 70

NXDOMAIN origins are advertised as playable, Nginx child add_header blocks drop CSP, Docker omits public launch files, and promote compares a version tag to a Git SHA.

Status: done
Recommended model: sonnet

## 11. Make replay integrity an enforced invariant instead of an unused signature

**Tier:** 🔥 · **Axis:** security / feature_depth · **Effort:** 2h · **Score:** 70

All replay/highlight/clip reads bypass verification and production can use a public development HMAC key.

Status: done
Recommended model: sonnet

## 12. Turn the false Rematch sent state into a real cloned-config lobby corridor

**Tier:** 🔥 · **Axis:** ux / retention / feedback_loop · **Effort:** 4h · **Score:** 70

The client ignores failure/URL and the server stores intent without creating a lobby; telemetry counts clicks that may do nothing.

Status: done
Recommended model: sonnet

## 13. Turn hidden process-local persistence into a state-scope ledger and fail-closed database posture

**Tier:** 🔥 · **Axis:** reliability / observability / ecosystem / innovation · **Effort:** 6h · **Score:** 68

PostgreSQL logs fallback while pool remains non-null after failure, readiness ignores persistence, and advertised persistent features use process-local maps.

Status: done
Recommended model: sonnet

## 14. Braid the branded convoy loop into a decisive parallel victory path

**Tier:** 🔥 · **Axis:** gamification / feature_depth / innovation · **Effort:** 6h · **Score:** 67

Vault mechanics are substantive, but victory still belongs entirely to inherited territory/time rules.

Status: done
Recommended model: sonnet

## 15. Reserve remote-AI budget only for validated provider-bound work

**Tier:** 🔥 · **Axis:** security / capital_efficiency / ai_integration · **Effort:** 4h · **Score:** 66

Several routes reserve process-local budget before identity, validation, or cache lookup, and readiness labels the per-process ceiling as a global hard cap.

Status: done
Recommended model: sonnet

## 16. Restore green CI with an explicit coverage ratchet

**Tier:** 🔥 · **Axis:** speed_organization / feedback_loop · **Effort:** 2.5h · **Score:** 65

Blank E2E_BASE_URL invalidates every relative navigation; formatting and a disconnected 70% threshold keep main red despite local unit green.

Status: done
Recommended model: sonnet

## 17. Make the coach instant and cost-neutral by default

**Tier:** ⚡ · **Axis:** ai_integration / token_api_reduction / ux · **Effort:** 2h · **Score:** 64

Known tactical triggers currently require an anonymous paid call and disappear without an API key despite sufficient structured game state.

Status: done
Recommended model: sonnet

## 18. Make the shipped meta game reachable through a coherent Command Center and prove liveness

**Tier:** 🔥 · **Axis:** feature_depth / ux / gamification / innovation · **Effort:** 7h · **Score:** 63

Achievements, season pass, clans, tournaments, experiment dashboard, and achievement toasts exist but are not imported, mounted, navigable, or exercised end to end.

Status: done
Recommended model: sonnet

## 19. Reconcile the public-unlaunched profile and make remote AI spend impossible by default

**Tier:** 🔥 · **Axis:** security / token_api_reduction / truth · **Effort:** 3h · **Score:** 62

Registry says public-unlaunched while local status claims internal/exempt; thirteen model call sites lack a unified public cost contract.

Status: done
Recommended model: sonnet

## 20. Bind AI outputs and caches to authenticated canonical match evidence

**Tier:** 🔥 · **Axis:** ai_integration / security / correctness / cost · **Effort:** 5h · **Score:** 60

Oracle caches player-specific predictions by player-count bucket, while recap and coach accept unverified narratives that can poison confident game-key output.

Status: done
Recommended model: sonnet

## 21. Eliminate production-build warning drift at the source

**Tier:** ⚡ · **Axis:** dev_health / performance / release · **Effort:** 3h · **Score:** 60

The production build emits unset canonical/OG placeholders, inconsistent JSON import attributes, a circular manual-chunk dependency, and misleading chunk warnings.

Status: done
Recommended model: sonnet

## 22. Separate server health, declared checks, and release readiness

**Tier:** ⚡ · **Axis:** feedback_loop / truth / release · **Effort:** 1.5h · **Score:** 60

The API says ready when only the process is healthy, hardcodes passes, and cites a rights document absent from the public index.

Status: done
Recommended model: sonnet

## 23. Budget what users and telemetry systems actually pay

**Tier:** ⚡ · **Axis:** performance / observability / automation · **Effort:** 3h · **Score:** 58

Metrics attach unbounded game IDs while the bundle gate checks chunks independently and ignores aggregate initial JS and giant media.

Status: done
Recommended model: sonnet

## 24. Close the private-game creation authorization and allocation bypass

**Tier:** 🔥 · **Axis:** security / reliability · **Effort:** 3h · **Score:** 56

Any non-empty admin header authorizes private creation without a bearer actor, and GameManager replaces or allocates IDs without collision or worker-cap protection.

Status: done
Recommended model: sonnet

## 25. Block contradictory public-audience and exempt-internal release metadata

**Tier:** 🔥 · **Axis:** truth / capital_efficiency / ecosystem · **Effort:** 1h · **Score:** 56

The registry says public-unlaunched but freeTierCostStatus and audit note say exempt-internal, causing both cost gates to ALLOW falsely.

Status: done
Recommended model: sonnet

## 26. Extend bounded transport policy from WebSockets to both Server-Sent Event buses

**Tier:** 🔥 · **Axis:** security / reliability / performance · **Effort:** 4h · **Score:** 53

StreamingBus and NarratorBus accept unbounded subscribers and ignore response backpressure, retaining slow consumers outside the claimed transport posture.

Status: done
Recommended model: sonnet

## 27. Unify task parsing and make startup brief freshness source-coherent

**Tier:** 🔥 · **Axis:** observability / process / token_efficiency · **Effort:** 4h · **Score:** 53

The shared parser finds six live Genius items while cross-repo aggregation returns zero, errors collapse to empty counts, and age-only staleness accepted a Session 73 brief after Session 74 landed.

Status: done
Recommended model: sonnet

## 28. Make recovery and Canon wave checks machine-honest

**Tier:** ⚡ · **Axis:** speed_organization / token_api_reduction / process · **Effort:** 2.5h · **Score:** 52

Startup misses Session N headings, CANON-044 emits '}', task parsing ignores live bullets, and stash provenance required manual reconstruction.

Status: done
Recommended model: sonnet

## 29. Remove all fix-available critical/high dependency advisories

**Tier:** 🔥 · **Axis:** security / dev_health · **Effort:** 3h · **Score:** 52

The lockfile has 34 advisories including 5 critical and 8 high across direct runtime/tooling packages.

Status: done
Recommended model: sonnet

## 30. Close every Windows spawn-policy blind spot and remove the broken v5 renderer branch

**Tier:** 🔥 · **Axis:** reliability / developer_experience / security · **Effort:** 3h · **Score:** 48

Doctor reports green while a dynamic raw child_process import lacks windowsHide, its v5 target is missing, and TypeScript test and perf spawners sit outside the scanner.

Status: done
Recommended model: sonnet

## 31. Replace 100 ms full VaultFront projection broadcasts with invalidation-driven deltas

**Tier:** ⚡ · **Axis:** performance / feedback_loop / architecture · **Effort:** 5h · **Score:** 48

Every tick rebuilds sites, convoys, five route previews, structure scans, and a full payload even when objective state is unchanged, with no dedicated benchmark.

Status: done
Recommended model: sonnet

## 32. Replace unwired progression shells with one idempotent match-outcome fan-out

**Tier:** 🔥 · **Axis:** gamification / feature_depth · **Effort:** 5h · **Score:** 48

Achievement/season recorders lack production callers, three components are unmounted, identity is missing in one activity path, and style schemas drift.

Status: done
Recommended model: sonnet

## 33. Build the local public-launch foundation without pretending staging exists

**Tier:** ⚡ · **Axis:** ux / release / dual_audience · **Effort:** 3h · **Score:** 46

Sitemap compliance is 0/10; footer/legal contacts are upstream, and contact/agent/sitemap/footer-manifest surfaces are absent.

Status: done
Recommended model: sonnet

## 34. Remove Dependabot red noise and disable the dormant upstream release path

**Tier:** 🔥 · **Axis:** automation / security / process · **Effort:** 4h · **Score:** 45

The last ten PR-description runs failed because trusted automation is forced through human prose and milestone gates, while a dormant workflow can target hard-coded OpenFront infrastructure.

Status: done
Recommended model: sonnet

## 35. Stop client identity and chat leakage and bound outbound notification delivery

**Tier:** ⚡ · **Axis:** security / privacy / observability · **Effort:** 3h · **Score:** 42

ChatModal logs sender and recipient objects plus message keys, while Discord embeds accept user content, permit mentions, lack timeout, and expose no posture.

Status: done
Recommended model: sonnet

## 36. Turn Worker route sprawl into a typed testable route manifest

**Tier:** ⚡ · **Axis:** organization / security / token_efficiency · **Effort:** 6h · **Score:** 41

Worker is roughly 4,000 lines with dozens of inline schemas and routes, while authorization tests scan strings and can pass without semantic enforcement.

Status: done
Recommended model: sonnet

## 37. Make the stale shell deployment chain dry-runnable immutable and cleanup-bounded

**Tier:** ⚡ · **Axis:** reliability / release / automation · **Effort:** 5h · **Score:** 34

The active deployment wrapper calls an unproven March-era SSH chain with no successful Deploy history, while the updater prunes every unused image without retention budget.

Status: done
Recommended model: sonnet
