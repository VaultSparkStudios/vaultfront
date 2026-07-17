/**
 * SpectatorBus — broadcasts game turn updates to read-only spectator connections.
 *
 * Architecture:
 * - Spectators connect via WebSocket to /spectate/:gameId (new route, Worker.ts)
 * - Each turn, the Worker calls SpectatorBus.broadcast(gameId, turnData)
 * - SpectatorBus fans out the serialized turn to all registered spectator sockets
 * - Spectators receive the same turn payload as players but send NO intents
 * - The client SpectatorRunner initialises the simulation from the game's
 *   public snapshot and then applies each incoming turn in sequence
 *
 * Status: SCAFFOLDED — add the /spectate route to Worker.ts and call
 * broadcast() alongside the existing player fan-out loop.
 */

import type { WebSocket } from "ws";
import { logger as Logger } from "./Logger";

export const MAX_SPECTATORS_PER_GAME = 128;
export const MAX_SPECTATORS_PER_WORKER = 1024;
export const MAX_SPECTATOR_BUFFERED_BYTES = 256 * 1024;

export interface SpectatorBusOptions {
  maxBufferedBytes?: number;
  maxSpectatorsPerGame?: number;
  maxSpectatorsPerWorker?: number;
}

export class SpectatorBus {
  /** Map from gameId → set of spectator WebSocket connections */
  private channels = new Map<string, Set<WebSocket>>();
  private readonly maxBufferedBytes: number;
  private readonly maxSpectatorsPerGame: number;
  private readonly maxSpectatorsPerWorker: number;
  private totalSpectators = 0;

  constructor(options: SpectatorBusOptions = {}) {
    this.maxBufferedBytes =
      options.maxBufferedBytes ?? MAX_SPECTATOR_BUFFERED_BYTES;
    this.maxSpectatorsPerGame =
      options.maxSpectatorsPerGame ?? MAX_SPECTATORS_PER_GAME;
    this.maxSpectatorsPerWorker =
      options.maxSpectatorsPerWorker ?? MAX_SPECTATORS_PER_WORKER;
  }

  /** Register a new spectator for a game. */
  join(gameId: string, ws: WebSocket): boolean {
    if (!this.channels.has(gameId)) {
      this.channels.set(gameId, new Set());
    }
    const channel = this.channels.get(gameId)!;
    if (channel.has(ws)) return true;
    if (
      channel.size >= this.maxSpectatorsPerGame ||
      this.totalSpectators >= this.maxSpectatorsPerWorker
    ) {
      if (channel.size === 0) this.channels.delete(gameId);
      return false;
    }
    channel.add(ws);
    this.totalSpectators += 1;
    Logger.info(`Spectator joined game ${gameId}`, {
      spectatorCount: this.channels.get(gameId)!.size,
    });

    ws.on("close", () => this.leave(gameId, ws));
    ws.on("error", () => this.leave(gameId, ws));

    // Spectators must not send intents — silently drop any messages
    ws.on("message", () => {
      /* intentionally empty */
    });
    return true;
  }

  /** Remove a spectator from a game channel. */
  leave(gameId: string, ws: WebSocket): void {
    const channel = this.channels.get(gameId);
    if (!channel) return;
    if (channel.delete(ws)) this.totalSpectators -= 1;
    if (channel.size === 0) {
      this.channels.delete(gameId);
    }
  }

  /** Broadcast a serialized turn payload to all spectators of a game. */
  broadcast(gameId: string, data: Buffer | Uint8Array): void {
    const channel = this.channels.get(gameId);
    if (!channel || channel.size === 0) return;

    for (const ws of channel) {
      if (ws.readyState === 1 /* WebSocket.OPEN */) {
        if (ws.bufferedAmount > this.maxBufferedBytes) {
          Logger.warn("SpectatorBus closing slow spectator", {
            bufferedBytes: ws.bufferedAmount,
          });
          this.leave(gameId, ws);
          ws.close(1013, "Spectator is too slow");
          continue;
        }
        ws.send(data, { binary: true }, (err) => {
          if (err) {
            Logger.warn("SpectatorBus send error", { gameId, err });
            this.leave(gameId, ws);
          }
        });
      } else {
        this.leave(gameId, ws);
      }
    }
  }

  /** Returns the number of spectators watching a game. */
  spectatorCount(gameId: string): number {
    return this.channels.get(gameId)?.size ?? 0;
  }

  workerSpectatorCount(): number {
    return this.totalSpectators;
  }

  /** Clean up all spectators for a game when it ends. */
  closeGame(gameId: string): void {
    const channel = this.channels.get(gameId);
    if (!channel) return;
    this.totalSpectators -= channel.size;
    for (const ws of channel) {
      ws.close(1000, "Game ended");
    }
    this.channels.delete(gameId);
  }
}

/** Singleton — import and use in Worker.ts */
export const spectatorBus = new SpectatorBus();
