/**
 * RematchStore — tracks post-game rematch intents with a short TTL.
 *
 * Flow:
 *   1. Game ends → any player calls POST /api/rematch/:gameId with their playerId.
 *   2. Server stores the intent, returns a rematch code and joinUrl.
 *   3. Other players from the same game call POST /api/rematch/:gameId to join.
 *   4. When all original players have joined (or TTL expires), the rematch lobby
 *      is created by the matchmaking system using the stored game config.
 *
 * Storage: in-memory with automatic TTL eviction (5 minutes). No Postgres
 * persistence needed — rematch intents are ephemeral by design.
 */

import { nanoid } from "nanoid";

export interface RematchEntry {
  gameId: string;
  code: string;
  playerIds: string[];
  mapName: string;
  expiresAt: number;
  joinUrl: string;
}

const TTL_MS = 5 * 60 * 1_000; // 5 minutes
const PLAY_BASE =
  process.env.PLAY_BASE_URL ?? "https://play-vaultfront.vaultsparkstudios.com";

class RematchStore {
  private entries = new Map<string, RematchEntry>();
  private codeToGameId = new Map<string, string>();

  constructor() {
    // Evict expired entries every 60 seconds
    setInterval(() => this.evict(), 60_000);
  }

  /** Create or join a rematch for the given game. Returns the updated entry. */
  upsert(gameId: string, playerId: string, mapName = ""): RematchEntry {
    const existing = this.entries.get(gameId);
    if (existing) {
      if (!existing.playerIds.includes(playerId)) {
        existing.playerIds.push(playerId);
      }
      return existing;
    }

    const code = nanoid(8);
    const entry: RematchEntry = {
      gameId,
      code,
      playerIds: [playerId],
      mapName,
      expiresAt: Date.now() + TTL_MS,
      joinUrl: `${PLAY_BASE}/join?rematch=${encodeURIComponent(code)}`,
    };
    this.entries.set(gameId, entry);
    this.codeToGameId.set(code, gameId);
    return entry;
  }

  get(gameId: string): RematchEntry | null {
    const entry = this.entries.get(gameId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.remove(gameId);
      return null;
    }
    return entry;
  }

  getByCode(code: string): RematchEntry | null {
    const gameId = this.codeToGameId.get(code);
    if (!gameId) return null;
    return this.get(gameId);
  }

  private remove(gameId: string): void {
    const entry = this.entries.get(gameId);
    if (entry) this.codeToGameId.delete(entry.code);
    this.entries.delete(gameId);
  }

  private evict(): void {
    const now = Date.now();
    for (const [gameId, entry] of this.entries) {
      if (now > entry.expiresAt) this.remove(gameId);
    }
  }
}

export const rematchStore = new RematchStore();
