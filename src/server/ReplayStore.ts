/**
 * ReplayStore — records per-game input logs for replay playback.
 *
 * Architecture:
 * - The deterministic core re-runs from a seed + ordered input list.
 * - Each game records: initial seed, map, config, and every player intent in
 *   turn order.
 * - On playback the client receives the input log and drives the simulation
 *   forward at configurable speed.
 *
 * Storage: in-memory for development; swap `save`/`load` for S3 or Postgres
 * by implementing the ReplayBackend interface.
 *
 * Status: SCAFFOLDED — wire ReplayStore.record() into GameServer turn loop,
 * then expose /api/replay/:id on Worker.
 */

export interface ReplayIntent {
  /** Serialized player intent (matches existing transport format) */
  serialized: Uint8Array;
  /** Turn number the intent was applied */
  turn: number;
  /** Small player ID */
  playerSmallID: number;
}

export interface ReplayManifest {
  gameId: string;
  mapName: string;
  seed: number;
  configSnapshot: Record<string, unknown>;
  startedAt: number;
  endedAt?: number;
  durationTurns: number;
  intents: ReplayIntent[];
}

export interface ReplayBackend {
  save(gameId: string, manifest: ReplayManifest): Promise<void>;
  load(gameId: string): Promise<ReplayManifest | null>;
  list(limit?: number): Promise<{ gameId: string; startedAt: number }[]>;
}

/** In-memory backend — suitable for development and single-instance staging */
class InMemoryReplayBackend implements ReplayBackend {
  private store = new Map<string, ReplayManifest>();

  async save(gameId: string, manifest: ReplayManifest): Promise<void> {
    this.store.set(gameId, manifest);
    // Evict oldest entries if over limit
    if (this.store.size > 500) {
      const oldest = [...this.store.entries()].sort(
        ([, a], [, b]) => a.startedAt - b.startedAt,
      )[0];
      this.store.delete(oldest[0]);
    }
  }

  async load(gameId: string): Promise<ReplayManifest | null> {
    return this.store.get(gameId) ?? null;
  }

  async list(limit = 20): Promise<{ gameId: string; startedAt: number }[]> {
    return [...this.store.entries()]
      .map(([gameId, m]) => ({ gameId, startedAt: m.startedAt }))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }
}

export class ReplayStore {
  private backend: ReplayBackend;
  private activeRecordings = new Map<string, ReplayManifest>();

  constructor(backend: ReplayBackend = new InMemoryReplayBackend()) {
    this.backend = backend;
  }

  /**
   * Begin recording a new game.
   * Call once after the game is created and the seed is known.
   */
  startRecording(
    gameId: string,
    mapName: string,
    seed: number,
    configSnapshot: Record<string, unknown>,
  ): void {
    this.activeRecordings.set(gameId, {
      gameId,
      mapName,
      seed,
      configSnapshot,
      startedAt: Date.now(),
      durationTurns: 0,
      intents: [],
    });
  }

  /**
   * Record a player intent for the current turn.
   * Call once per intent as they are processed by the game loop.
   */
  recordIntent(
    gameId: string,
    turn: number,
    playerSmallID: number,
    serialized: Uint8Array,
  ): void {
    const recording = this.activeRecordings.get(gameId);
    if (!recording) return;
    recording.intents.push({ serialized, turn, playerSmallID });
    recording.durationTurns = Math.max(recording.durationTurns, turn);
  }

  /**
   * Finalize and persist a game recording.
   * Call when the game ends.
   */
  async finishRecording(gameId: string): Promise<void> {
    const recording = this.activeRecordings.get(gameId);
    if (!recording) return;
    recording.endedAt = Date.now();
    this.activeRecordings.delete(gameId);
    await this.backend.save(gameId, recording);
  }

  async getReplay(gameId: string): Promise<ReplayManifest | null> {
    return this.backend.load(gameId);
  }

  async listReplays(
    limit = 20,
  ): Promise<{ gameId: string; startedAt: number }[]> {
    return this.backend.list(limit);
  }
}

/** Singleton — import and use in Worker.ts */
export const replayStore = new ReplayStore();
