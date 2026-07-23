<!-- generated-by: scripts/generate-genius-list.mjs -->
<!-- generated-at: 2026-07-23T03:09:55.219Z -->

# Unified Genius List

Project: vaultfront
IGNIS source: latest-audit-sidecar

## 1. Rebuild Daily Challenge as a certified, durable Daily Mastery contract

**Tier:** 🔥 · **Axis:** gamification / retention / security / feature depth · **Effort:** 8h · **Score:** 108

The HUD fetches a challenge, but normal play never sends an authenticated persistentId to the only progress caller; the store advertises bonus gold no caller applies and clears all progress on restart. This is a visible retention promise that cannot complete honestly.

Status: done
Recommended model: sonnet

## 2. Make authenticated Alpha evidence restart-durable and privacy-minimal

**Tier:** 🔥 · **Axis:** feedback loop / security / observability / engagement · **Effort:** 6h · **Score:** 103

The Alpha gate currently derives from module-global maps and counters, so every worker restart erases the three-human sample. Its public summary also returns eventId and evidenceSessionId even though neither identifier is needed for public readiness.

Status: done
Recommended model: sonnet

## 3. Make every PROJECT_STATUS mutation use one atomic invariant writer

**Tier:** 🔥 · **Axis:** security / observability / organization · **Effort:** 3h · **Score:** 88

verify-plan-mode, detect-session-mode, render-startup-brief, and project-doctor write PROJECT_STATUS directly despite the declared canonical writer, allowing SIL invariants or concurrent fields to be lost.

Status: done
Recommended model: sonnet

## 4. Make the declared route-policy plane cover the real mutation surface

**Tier:** 🔥 · **Axis:** security / organization / observability · **Effort:** 4h · **Score:** 86

RoutePolicyManifest declares only a small hand-picked subset while Worker registers dozens of POST routes. MutationAuthorizationContract protects another manually maintained subset by searching source text, so an unlisted mutation can bypass both truth surfaces.

Status: done
Recommended model: sonnet

## 5. Receive a source-tagged registry correction receipt

**Tier:** ⚡ · **Axis:** ecosystem / observability / security · **Effort:** 1h · **Score:** 79

The arc profiler selected the wrong audit lens again while local source-of-truth consistently says game.

Status: externally-blocked — Studio Ops still reports type=app after prior correction and follow-up cargo; CANON-018 forbids editing the sibling registry or arc-profile producer from VaultFront.
Recommended model: sonnet

## 6. Delete unreachable shipped-looking client code and make orphan features fail CI

**Tier:** 🔥 · **Axis:** feature depth / ux / speed / organization · **Effort:** 4h · **Score:** 77

Ten client modules have no runtime importer, mount, or entrypoint; several advertise missing endpoints or duplicate mature replay paths, and some would double-register custom elements if imported.

Status: done
Recommended model: sonnet

## 7. Make E2E bootstrap survive canvas prebuild outages and use canonical health

**Tier:** 🔥 · **Axis:** dev health / release / reliability · **Effort:** 2h · **Score:** 68

The latest E2E run failed before tests when canvas prebuild download fell back to node-gyp without pixman. Playwright system dependencies install only after npm ci, and deploy/promote probe /api/health while the canonical release contract names /_health.

Status: done
Recommended model: sonnet

## 8. Converge startup, freshness, forecast, and closeout on one typed session parser

**Tier:** ⚡ · **Axis:** observability / organization / token efficiency · **Effort:** 3h · **Score:** 62

Four generated surfaces recognize different Session/S heading grammars; brief freshness even treats prose mentions as authoritative, so a plausible document can silently pick the wrong session.

Status: done
Recommended model: sonnet

## 9. Repair the Dependabot PR contract without weakening machine-authorship trust

**Tier:** ⚡ · **Axis:** dev health / security / delivery efficiency · **Effort:** 2h · **Score:** 62

The live github-actions group PR changes only workflow action pins, but Validate Description rejects every workflow file because the trusted-automation allowlist only admits package manifests. Build, test, E2E, milestone, and brief checks pass, so the red gate is a contract false positive.

Status: done
Recommended model: sonnet

## 10. Make test and coverage commands describe the real production risk surface

**Tier:** ⚡ · **Axis:** dev health / speed / test reliability · **Effort:** 3h · **Score:** 53

npm test runs the server suite twice, coverage only includes loaded modules with zero native thresholds, Worker is absent, and the three-file custom ratchet omits the largest client/server risk surfaces.

Status: done
Recommended model: sonnet

## 11. Exercise the exact digest through a real staging observation corridor

**Tier:** 🔥 · **Axis:** feedback loop / release / ecosystem · **Effort:** 8h · **Score:** 45

Local artifacts and contracts are strong, but the release gate is correctly NO-GO without live parity and human/business evidence.

Status: externally-blocked — Cloudflare and Brevo capabilities are ready, but no approved external staging origin/environment or Obelisk relying-party registration exists; human Alpha, revenue, and founder approval are non-substitutable observations.
Recommended model: sonnet
