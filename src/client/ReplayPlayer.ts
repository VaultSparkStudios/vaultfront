/**
 * ReplayPlayer — drives the deterministic simulation from a replay manifest.
 *
 * Architecture:
 * - Fetches the ReplayManifest from /api/replay/:id
 * - Re-initialises the game worker with the same seed, map, and config
 * - Feeds recorded intents to the worker in turn order
 * - Provides playback controls: play/pause, speed (0.25x–4x), scrub
 *
 * Status: SCAFFOLDED — implement workerChannel integration after
 * ReplayStore is wired into Worker.ts.
 */

import type { ReplayManifest } from "../server/ReplayStore";

export type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 4;

export interface ReplayControls {
  play(): void;
  pause(): void;
  setSpeed(speed: ReplaySpeed): void;
  scrubToTurn(turn: number): void;
  readonly isPlaying: boolean;
  readonly currentTurn: number;
  readonly totalTurns: number;
  readonly speed: ReplaySpeed;
}

export class ReplayPlayer implements ReplayControls {
  private manifest: ReplayManifest;
  private _currentTurn = 0;
  private _isPlaying = false;
  private _speed: ReplaySpeed = 1;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private onTurnAdvance: (turn: number) => void;

  get isPlaying() {
    return this._isPlaying;
  }
  get currentTurn() {
    return this._currentTurn;
  }
  get totalTurns() {
    return this.manifest.durationTurns;
  }
  get speed() {
    return this._speed;
  }

  constructor(
    manifest: ReplayManifest,
    onTurnAdvance: (turn: number) => void,
  ) {
    this.manifest = manifest;
    this.onTurnAdvance = onTurnAdvance;
  }

  play(): void {
    if (this._isPlaying) return;
    this._isPlaying = true;
    // Base interval is 100ms (10 ticks/s at 1x); scaled by speed.
    const intervalMs = Math.round(100 / this._speed);
    this._timer = setInterval(() => {
      if (this._currentTurn >= this.manifest.durationTurns) {
        this.pause();
        return;
      }
      this._currentTurn++;
      this.onTurnAdvance(this._currentTurn);
    }, intervalMs);
  }

  pause(): void {
    this._isPlaying = false;
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  setSpeed(speed: ReplaySpeed): void {
    const wasPlaying = this._isPlaying;
    if (wasPlaying) this.pause();
    this._speed = speed;
    if (wasPlaying) this.play();
  }

  scrubToTurn(turn: number): void {
    const wasPlaying = this._isPlaying;
    if (wasPlaying) this.pause();
    this._currentTurn = Math.max(0, Math.min(turn, this.manifest.durationTurns));
    this.onTurnAdvance(this._currentTurn);
    if (wasPlaying) this.play();
  }

  /** Return all intents that occurred up to and including `turn` */
  intentsForTurn(turn: number) {
    return this.manifest.intents.filter((i) => i.turn === turn);
  }
}

/**
 * Fetch a replay manifest from the server.
 * @param gameId The game ID to replay
 */
export async function fetchReplay(gameId: string): Promise<ReplayManifest | null> {
  try {
    const res = await fetch(`/api/replay/${encodeURIComponent(gameId)}`);
    if (!res.ok) return null;
    return (await res.json()) as ReplayManifest;
  } catch {
    return null;
  }
}
