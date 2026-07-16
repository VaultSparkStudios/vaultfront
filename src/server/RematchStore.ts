/**
 * RematchStore — worker-local registry for real post-game lobby corridors.
 *
 * A rematch entry exists only after Worker has authenticated the caller,
 * cloned the source game's safe configuration, and created the lobby. The
 * store contains privacy-safe participant keys and never treats an intent as
 * a successful rematch.
 */

import { nanoid } from "nanoid";

export interface RematchEntry {
  gameId: string;
  lobbyId: string;
  code: string;
  mapName: string;
  expiresAt: number;
  joinUrl: string;
  participantCount: number;
  status: "ready";
}

interface StoredRematchEntry extends RematchEntry {
  participantKeys: Set<string>;
}

export interface CreateRematchEntryInput {
  gameId: string;
  lobbyId: string;
  actorKey: string;
  mapName: string;
  joinUrl: string;
}

const TTL_MS = 5 * 60 * 1_000;

export class RematchStore {
  private entries = new Map<string, StoredRematchEntry>();
  private codeToGameId = new Map<string, string>();

  constructor(private readonly now: () => number = Date.now) {
    const timer = setInterval(() => this.evict(), 60_000);
    timer.unref?.();
  }

  /** Register a lobby that has already been created successfully. */
  create(input: CreateRematchEntryInput): RematchEntry {
    const existing = this.getStored(input.gameId);
    if (existing) {
      existing.participantKeys.add(input.actorKey);
      existing.participantCount = existing.participantKeys.size;
      return this.toPublicEntry(existing);
    }

    const code = nanoid(8);
    const participantKeys = new Set([input.actorKey]);
    const entry: StoredRematchEntry = {
      gameId: input.gameId,
      lobbyId: input.lobbyId,
      code,
      mapName: input.mapName,
      expiresAt: this.now() + TTL_MS,
      joinUrl: input.joinUrl,
      participantCount: participantKeys.size,
      participantKeys,
      status: "ready",
    };
    this.entries.set(input.gameId, entry);
    this.codeToGameId.set(code, input.gameId);
    return this.toPublicEntry(entry);
  }

  join(gameId: string, actorKey: string): RematchEntry | null {
    const entry = this.getStored(gameId);
    if (!entry) return null;
    entry.participantKeys.add(actorKey);
    entry.participantCount = entry.participantKeys.size;
    return this.toPublicEntry(entry);
  }

  get(gameId: string): RematchEntry | null {
    const entry = this.getStored(gameId);
    return entry ? this.toPublicEntry(entry) : null;
  }

  getByCode(code: string): RematchEntry | null {
    const gameId = this.codeToGameId.get(code);
    if (!gameId) return null;
    return this.get(gameId);
  }

  private getStored(gameId: string): StoredRematchEntry | null {
    const entry = this.entries.get(gameId);
    if (!entry) return null;
    if (this.now() > entry.expiresAt) {
      this.remove(gameId);
      return null;
    }
    return entry;
  }

  private toPublicEntry(entry: StoredRematchEntry): RematchEntry {
    return {
      gameId: entry.gameId,
      lobbyId: entry.lobbyId,
      code: entry.code,
      mapName: entry.mapName,
      expiresAt: entry.expiresAt,
      joinUrl: entry.joinUrl,
      participantCount: entry.participantCount,
      status: entry.status,
    };
  }

  private remove(gameId: string): void {
    const entry = this.entries.get(gameId);
    if (entry) this.codeToGameId.delete(entry.code);
    this.entries.delete(gameId);
  }

  private evict(): void {
    const now = this.now();
    for (const [gameId, entry] of this.entries) {
      if (now > entry.expiresAt) this.remove(gameId);
    }
  }
}

export const rematchStore = new RematchStore();
