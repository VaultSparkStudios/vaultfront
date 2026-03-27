# Decisions

Append new entries. Do not erase historical reasoning unless it is wrong.

## Entry template

### YYYY-MM-DD - Decision title

- Status:
- Context:
- Decision:
- Alternatives considered:
- Why this was chosen:
- Follow-up:

---

### 2026-03-26 - Replay recording via Turn objects (not serialized intents)

- Status: Accepted
- Context: ReplayStore scaffold used `serialized: Uint8Array` per intent, which requires understanding the full protobuf serialization pipeline before wiring
- Decision: Added `recordTurn(gameId, turn)` method that stores plain `Turn` objects (JSON-serializable intents). The `turns[]` field in ReplayManifest is the preferred playback source.
- Alternatives considered: Wire the full serialization pipeline from scratch
- Why this was chosen: Unblocks replay immediately; can layer in binary format later without breaking the API
- Follow-up: If replay file sizes become a concern at scale, add S3 backend + compression

---

### 2026-03-26 - Spectator WebSocket upgrade handled in WorkerLobbyService

- Status: Accepted
- Context: WorkerLobbyService already owns the HTTP upgrade handler; adding spectator there keeps all WebSocket routing in one place
- Decision: Added a third WebSocketServer (`spectatorWss`) alongside `gameWss` and `lobbiesWss`; routes `/spectate/:gameId` paths to it
- Alternatives considered: Handle in Worker.ts directly
- Why this was chosen: Keeps upgrade routing centralised; avoids spreading WS logic across files
- Follow-up: None

---

### 2026-03-26 - Execution chain, surge, and squad objective surfaced via VaultFrontStatusUpdate

- Status: Accepted
- Context: Three major mechanics (execution chain, comeback surge, squad objectives) existed only in execution layer with no client visibility
- Decision: Extended VaultFrontStatusUpdate with `executionChains`, `surges`, and `squadObjectives` fields; VaultFrontLayer renders them as combo meter, surge badge, and squad ring
- Alternatives considered: Separate event emissions per mechanic; custom HUD component in DOM
- Why this was chosen: VaultFrontStatusUpdate is already the single source of truth for all vault state; extending it keeps the pattern consistent
- Follow-up: Add tests for the new published fields in VaultFrontExecution tests

---

### 2026-03-26 - Adopt VaultSpark Studio OS

- Status: Accepted
- Context: VaultSpark Studios requires all projects to run under Studio OS for agent continuity and Studio Hub integration
- Decision: Bootstrap all required Studio OS files in this repo
- Alternatives considered: No structured context system
- Why this was chosen: Enables agent handoffs, hub visibility, and consistent studio protocols
- Follow-up: Fill out project-specific content in all context files
