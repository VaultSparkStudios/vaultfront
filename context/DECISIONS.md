# Decisions

Public-safe decisions only. Detailed internal decision history is maintained privately.

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
