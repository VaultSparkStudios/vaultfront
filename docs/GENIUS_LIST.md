<!-- generated-by: scripts/generate-genius-list.mjs -->
<!-- generated-at: 2026-07-17T02:05:25.013Z -->

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

## 3. Bound WebSocket payload, connection, and slow-consumer memory

**Tier:** 🔥 · **Axis:** security / performance / reliability · **Effort:** 4h · **Score:** 82

Three noServer WebSocket servers inherit a 100 MiB maxPayload and spectator fan-out has no bufferedAmount ceiling.

Status: done
Recommended model: sonnet

## 4. Derive worker readiness from live IPC, HTTP, and game-loop watermarks

**Tier:** 🔥 · **Axis:** observability / reliability / truth · **Effort:** 3h · **Score:** 80

Worker readiness currently passes healthy:true while experiment and alpha evidence are process-local and volatile.

Status: done
Recommended model: sonnet

## 5. Replace the zero-exit doctor stub with a real project health contract

**Tier:** 🔥 · **Axis:** process / automation / observability · **Effort:** 3h · **Score:** 78

scripts/ops.mjs doctor prints a context-meter hint and exits 0 without tests, probes, or blockingFailing.

Status: done
Recommended model: sonnet

## 6. Replace forgeable process-global Alpha Gate counters with session-scoped evidence

**Tier:** 🔥 · **Axis:** feedback_loop / security / innovation · **Effort:** 3h · **Score:** 78

The unauthenticated POST accepts caller-selected weights and synthetic events can turn the gate green.

Status: done
Recommended model: sonnet

## 7. Drive the genius list and closeout hint from the latest audit schema

**Tier:** 🔥 · **Axis:** process / ranking / continuity · **Effort:** 2.5h · **Score:** 76

The generator reads an obsolete hardcoded June audit and the closeout renderer reads cache.list.ranked while the generator writes top-level items.

Status: done
Recommended model: sonnet

## 8. Make headers, public CTAs, container artifacts, and promotion provenance agree

**Tier:** 🔥 · **Axis:** security / release / dual_audience · **Effort:** 5h · **Score:** 70

NXDOMAIN origins are advertised as playable, Nginx child add_header blocks drop CSP, Docker omits public launch files, and promote compares a version tag to a Git SHA.

Status: done
Recommended model: sonnet

## 9. Make replay integrity an enforced invariant instead of an unused signature

**Tier:** 🔥 · **Axis:** security / feature_depth · **Effort:** 2h · **Score:** 70

All replay/highlight/clip reads bypass verification and production can use a public development HMAC key.

Status: done
Recommended model: sonnet

## 10. Turn the false Rematch sent state into a real cloned-config lobby corridor

**Tier:** 🔥 · **Axis:** ux / retention / feedback_loop · **Effort:** 4h · **Score:** 70

The client ignores failure/URL and the server stores intent without creating a lobby; telemetry counts clicks that may do nothing.

Status: done
Recommended model: sonnet

## 11. Braid the branded convoy loop into a decisive parallel victory path

**Tier:** 🔥 · **Axis:** gamification / feature_depth / innovation · **Effort:** 6h · **Score:** 67

Vault mechanics are substantive, but victory still belongs entirely to inherited territory/time rules.

Status: done
Recommended model: sonnet

## 12. Reserve remote-AI budget only for validated provider-bound work

**Tier:** 🔥 · **Axis:** security / capital_efficiency / ai_integration · **Effort:** 4h · **Score:** 66

Several routes reserve process-local budget before identity, validation, or cache lookup, and readiness labels the per-process ceiling as a global hard cap.

Status: done
Recommended model: sonnet

## 13. Restore green CI with an explicit coverage ratchet

**Tier:** 🔥 · **Axis:** speed_organization / feedback_loop · **Effort:** 2.5h · **Score:** 65

Blank E2E_BASE_URL invalidates every relative navigation; formatting and a disconnected 70% threshold keep main red despite local unit green.

Status: done
Recommended model: sonnet

## 14. Make the coach instant and cost-neutral by default

**Tier:** ⚡ · **Axis:** ai_integration / token_api_reduction / ux · **Effort:** 2h · **Score:** 64

Known tactical triggers currently require an anonymous paid call and disappear without an API key despite sufficient structured game state.

Status: done
Recommended model: sonnet

## 15. Reconcile the public-unlaunched profile and make remote AI spend impossible by default

**Tier:** 🔥 · **Axis:** security / token_api_reduction / truth · **Effort:** 3h · **Score:** 62

Registry says public-unlaunched while local status claims internal/exempt; thirteen model call sites lack a unified public cost contract.

Status: done
Recommended model: sonnet

## 16. Eliminate production-build warning drift at the source

**Tier:** ⚡ · **Axis:** dev_health / performance / release · **Effort:** 3h · **Score:** 60

The production build emits unset canonical/OG placeholders, inconsistent JSON import attributes, a circular manual-chunk dependency, and misleading chunk warnings.

Status: done
Recommended model: sonnet

## 17. Separate server health, declared checks, and release readiness

**Tier:** ⚡ · **Axis:** feedback_loop / truth / release · **Effort:** 1.5h · **Score:** 60

The API says ready when only the process is healthy, hardcodes passes, and cites a rights document absent from the public index.

Status: done
Recommended model: sonnet

## 18. Budget what users and telemetry systems actually pay

**Tier:** ⚡ · **Axis:** performance / observability / automation · **Effort:** 3h · **Score:** 58

Metrics attach unbounded game IDs while the bundle gate checks chunks independently and ignores aggregate initial JS and giant media.

Status: done
Recommended model: sonnet

## 19. Block contradictory public-audience and exempt-internal release metadata

**Tier:** 🔥 · **Axis:** truth / capital_efficiency / ecosystem · **Effort:** 1h · **Score:** 56

The registry says public-unlaunched but freeTierCostStatus and audit note say exempt-internal, causing both cost gates to ALLOW falsely.

Status: done
Recommended model: sonnet

## 20. Make recovery and Canon wave checks machine-honest

**Tier:** ⚡ · **Axis:** speed_organization / token_api_reduction / process · **Effort:** 2.5h · **Score:** 52

Startup misses Session N headings, CANON-044 emits '}', task parsing ignores live bullets, and stash provenance required manual reconstruction.

Status: done
Recommended model: sonnet

## 21. Remove all fix-available critical/high dependency advisories

**Tier:** 🔥 · **Axis:** security / dev_health · **Effort:** 3h · **Score:** 52

The lockfile has 34 advisories including 5 critical and 8 high across direct runtime/tooling packages.

Status: done
Recommended model: sonnet

## 22. Replace unwired progression shells with one idempotent match-outcome fan-out

**Tier:** 🔥 · **Axis:** gamification / feature_depth · **Effort:** 5h · **Score:** 48

Achievement/season recorders lack production callers, three components are unmounted, identity is missing in one activity path, and style schemas drift.

Status: done
Recommended model: sonnet

## 23. Build the local public-launch foundation without pretending staging exists

**Tier:** ⚡ · **Axis:** ux / release / dual_audience · **Effort:** 3h · **Score:** 46

Sitemap compliance is 0/10; footer/legal contacts are upstream, and contact/agent/sitemap/footer-manifest surfaces are absent.

Status: done
Recommended model: sonnet
