# Decisions

Public-safe decisions only. Detailed internal decision history is maintained privately.

## 2026-07-16 — Generated Obelisk helpers remain quarantined until a native integration is ready

**Decision:** Remove all generated Obelisk helpers from deployable `src/` and untrack `obelisk-passport/` while retaining that reference cargo locally behind `.gitignore`.

**Why:** The committed React `.tsx` helper was unreferenced, introduced a missing `react` dependency, required JSX compiler settings the Lit project does not use, and broke `npm run build-prod`. The passport directory was also still tracked, so the prior local/ignored quarantine claim was not true in Git.

**Constraint:** Do not add a React dependency merely to preserve a generated stub. Implement Obelisk natively for the project Lit architecture only after production relying-party origin, callback contract, and server verification requirements are available and testable.

## 2026-07-16 — Keep rights provenance local/private while preserving AGPL obligations publicly

**Decision:** Untrack `docs/RIGHTS_PROVENANCE.md` from the public repository and keep it locally behind `.gitignore`. Retain the root AGPL-3.0 `LICENSE` and public source availability required by the OpenFrontIO fork obligation.

**Why:** The canonical sanitization scanner classifies the detailed rights ledger as a private Studio OS document. Removing it from the public index clears the private-document gate without weakening the actual copyleft notice or source-availability obligation.

## 2026-06-14 — Generated Obelisk passport stubs stay local until relying-party origin registration

**Decision:** `obelisk-passport/` is ignored in this repo until VaultFront has a registered production relying-party origin and a deliberate login/callback/server verification integration plan. The generated files can remain in the local workspace as reference cargo, but they are not deployable source yet.

**Rationale:** The generated passport itself says production origin is unknown. Committing or wiring it now would create an unfinished auth surface and a public promise before the Obelisk relying-party contract is ready.

---

## 2026-06-04 — Chain Guardian: threshold 3 consecutive captures, reset on site loss

**Decision:** Chain Guardian badge fires when any player makes 3 consecutive vault captures. The chain resets when the player's `passiveOwnerID` is overwritten by a different player capturing a site they previously owned. This is a session-scoped counter (not persisted); it resets implicitly at match end.

**Rationale:** Simplest implementation that still rewards the key skill expression without requiring cross-tick memory of complex defense sequences. The "consecutive" framing is player-intuitive and avoids confusion with the 3-step execution chain (capture → deliver → pulse-deny).

---

## 2026-06-04 — Narrator auto-blend: computed server-side from tickBucket only

**Decision:** `blendMode` is computed server-side in NarratorBus from the `tickBucket` field alone (early → tactical, mid → mixed, late → hype). Not from score differential (which would require additional state). Client cannot supply blendMode — it's injected at queue time.

**Rationale:** tickBucket is the single most reliable proxy for match drama without additional server-side tracking. Avoids adding a `scoreDelta` field to the context snapshot that would require Worker.ts to maintain cross-tick player score state.

---

## 2026-04-06 — CANON-008: All VaultSpark IP is proprietary by default

**Decision:** All code, content, assets, and designs created by VaultSpark Studios are proprietary and all rights are reserved by VaultSpark Studios LLC unless an open-source license is explicitly declared and approved by the Studio Owner. No agent may apply or imply an open-source license without Studio Owner direction.

**Applies to this project:** Yes — `docs/RIGHTS_PROVENANCE.md` reflects this project's specific license status.

**Rationale:** VaultSpark Studios LLC is a commercial entity building owned IP. Open-sourcing any project without deliberate strategy gives away commercial advantage and creates ownership ambiguity.

**Studio canon:** `vaultspark-studio-ops/docs/STUDIO_CANON.md` → CANON-008

---

## 2026-05-17 — Ghost route: shared-state deception via display-layer hiding

**Decision:** `ghost_route` hides opponent convoys from the opponent's HUD (skip rendering when `isGhost && !isOwnConvoy`) rather than per-player server filtering. Owner sees real ETA; opponents see nothing until delivery.

**Rationale:** Per-player update filtering would require major architecture changes. The display-layer approach is deterministic, server-authoritative (ghost flag lives in execution), and achieves the strategic deception goal.

---

## 2026-05-17 — Bot vault commands: simple pressure heuristic, not site queries

**Decision:** Bots use a local `hostile / total neighbors` pressure ratio to decide vault commands rather than querying vault site state directly. Site-targeting bias is added to `AiAttackBehavior` via the new `vaultSiteControllerIDs()` Game interface method.

**Rationale:** Keeps `BotExecution` lightweight; the `neighborPressure` heuristic matches NationExecution's proven pattern; vault-site bias in attack selection adds strategic depth without overcomplicating bot decision trees.

---
