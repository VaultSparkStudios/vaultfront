// VaultFront — Player stats and match history store.
// Primary store is in-memory (safe for pre-deployment).
// When DATABASE_URL is present, swap in the Postgres path (see TODO below).

import { EloRating } from "./EloRating";
import { logger } from "./Logger";

const log = logger.child({ comp: "PlayerStatsStore" });

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MatchResult {
  won: boolean;
  durationSeconds: number;
  vaultCaptures: number;
  convoyDeliveries: number;
  executionChains: number;
  mapName: string;
  playerCount: number;
  /** All participants in the match (used for Elo calculation). */
  allPlayers: Array<{ persistentId: string; won: boolean }>;
}

export interface MatchHistoryEntry {
  id: number;
  persistentId: string;
  gameId: string;
  won: boolean;
  durationSeconds: number;
  vaultCaptures: number;
  convoyDeliveries: number;
  executionChains: number;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  mapName: string;
  playerCount: number;
  createdAt: string; // ISO 8601
}

export interface PlayerStats {
  persistentId: string;
  displayName: string;
  eloRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  vaultCaptures: number;
  convoyDeliveries: number;
  executionChains: number;
  surgeActivations: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  persistentId: string;
  displayName: string;
  eloRating: number;
  rank: number;
  matchesPlayed: number;
  wins: number;
}

// ── In-memory data structures ──────────────────────────────────────────────────

interface InMemoryPlayerRecord {
  persistentId: string;
  displayName: string;
  eloRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  vaultCaptures: number;
  convoyDeliveries: number;
  executionChains: number;
  surgeActivations: number;
  createdAt: number; // Unix ms
  updatedAt: number;
}

interface InMemoryMatchEntry {
  id: number;
  persistentId: string;
  gameId: string;
  won: boolean;
  durationSeconds: number;
  vaultCaptures: number;
  convoyDeliveries: number;
  executionChains: number;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  mapName: string;
  playerCount: number;
  createdAt: number; // Unix ms
}

// ── Store implementation ───────────────────────────────────────────────────────

class PlayerStatsStore {
  private readonly players = new Map<string, InMemoryPlayerRecord>();
  private readonly history: InMemoryMatchEntry[] = [];
  private nextId = 1;

  // TODO: When DATABASE_URL is set, replace in-memory maps with Postgres queries.
  // Example connection setup:
  //   import { Pool } from 'pg';
  //   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Then replace each method body with the appropriate SQL from schema.sql.
  private readonly usePostgres = Boolean(process.env.DATABASE_URL);

  constructor() {
    if (this.usePostgres) {
      log.warn(
        "DATABASE_URL detected but Postgres path is not yet implemented. " +
          "Falling back to in-memory store. See TODO in PlayerStatsStore.ts.",
      );
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private ensurePlayer(
    persistentId: string,
    displayName: string,
  ): InMemoryPlayerRecord {
    const existing = this.players.get(persistentId);
    if (existing) {
      // Update display name if it changed
      if (displayName && displayName !== existing.displayName) {
        existing.displayName = displayName;
      }
      return existing;
    }
    const now = Date.now();
    const record: InMemoryPlayerRecord = {
      persistentId,
      displayName,
      eloRating: EloRating.DEFAULT_RATING,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      vaultCaptures: 0,
      convoyDeliveries: 0,
      executionChains: 0,
      surgeActivations: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.players.set(persistentId, record);
    return record;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Record a completed match for a player and update Elo for all participants.
   *
   * Elo approximation for multi-player games:
   *   - Winner(s) are matched against the average Elo of all losers (and vice-versa).
   *   - Each winner gains Elo vs. the loser average; each loser loses vs. the winner average.
   */
  async recordMatch(
    persistentId: string,
    displayName: string,
    gameId: string,
    result: MatchResult,
  ): Promise<void> {
    // Ensure all participants exist in the store
    for (const p of result.allPlayers) {
      const name = p.persistentId === persistentId ? displayName : "";
      this.ensurePlayer(p.persistentId, name);
    }

    const winners = result.allPlayers.filter((p) => p.won);
    const losers = result.allPlayers.filter((p) => !p.won);

    // Compute average Elo for each side (guard against empty arrays)
    const avgElo = (ids: Array<{ persistentId: string }>): number => {
      if (ids.length === 0) return EloRating.DEFAULT_RATING;
      const total = ids.reduce((sum, p) => {
        const rec = this.players.get(p.persistentId);
        return sum + (rec?.eloRating ?? EloRating.DEFAULT_RATING);
      }, 0);
      return Math.round(total / ids.length);
    };

    const winnerAvg = avgElo(winners);
    const loserAvg = avgElo(losers);

    const now = Date.now();

    // Update Elo for each winner
    for (const winner of winners) {
      const rec = this.players.get(winner.persistentId);
      if (!rec) continue;
      const eloResult = EloRating.calculate(rec.eloRating, loserAvg, true);
      const eloBefore = rec.eloRating;
      rec.eloRating = Math.max(100, eloResult.newRatingA);
      rec.matchesPlayed += 1;
      rec.wins += 1;
      rec.updatedAt = now;

      if (winner.persistentId === persistentId) {
        rec.vaultCaptures += result.vaultCaptures;
        rec.convoyDeliveries += result.convoyDeliveries;
        rec.executionChains += result.executionChains;
      }

      const entry: InMemoryMatchEntry = {
        id: this.nextId++,
        persistentId: winner.persistentId,
        gameId,
        won: true,
        durationSeconds:
          winner.persistentId === persistentId ? result.durationSeconds : 0,
        vaultCaptures:
          winner.persistentId === persistentId ? result.vaultCaptures : 0,
        convoyDeliveries:
          winner.persistentId === persistentId ? result.convoyDeliveries : 0,
        executionChains:
          winner.persistentId === persistentId ? result.executionChains : 0,
        eloBefore,
        eloAfter: rec.eloRating,
        eloDelta: rec.eloRating - eloBefore,
        mapName: result.mapName,
        playerCount: result.playerCount,
        createdAt: now,
      };
      this.history.push(entry);
      log.info("match recorded (win)", {
        persistentId: winner.persistentId,
        gameId,
        eloBefore,
        eloAfter: rec.eloRating,
      });
    }

    // Update Elo for each loser
    for (const loser of losers) {
      const rec = this.players.get(loser.persistentId);
      if (!rec) continue;
      const eloResult = EloRating.calculate(rec.eloRating, winnerAvg, false);
      const eloBefore = rec.eloRating;
      rec.eloRating = Math.max(100, eloResult.newRatingA);
      rec.matchesPlayed += 1;
      rec.losses += 1;
      rec.updatedAt = now;

      if (loser.persistentId === persistentId) {
        rec.vaultCaptures += result.vaultCaptures;
        rec.convoyDeliveries += result.convoyDeliveries;
        rec.executionChains += result.executionChains;
      }

      const entry: InMemoryMatchEntry = {
        id: this.nextId++,
        persistentId: loser.persistentId,
        gameId,
        won: false,
        durationSeconds:
          loser.persistentId === persistentId ? result.durationSeconds : 0,
        vaultCaptures:
          loser.persistentId === persistentId ? result.vaultCaptures : 0,
        convoyDeliveries:
          loser.persistentId === persistentId ? result.convoyDeliveries : 0,
        executionChains:
          loser.persistentId === persistentId ? result.executionChains : 0,
        eloBefore,
        eloAfter: rec.eloRating,
        eloDelta: rec.eloRating - eloBefore,
        mapName: result.mapName,
        playerCount: result.playerCount,
        createdAt: now,
      };
      this.history.push(entry);
      log.info("match recorded (loss)", {
        persistentId: loser.persistentId,
        gameId,
        eloBefore,
        eloAfter: rec.eloRating,
      });
    }
  }

  /**
   * Retrieve match history for a player, most recent first.
   */
  async getHistory(
    persistentId: string,
    limit = 20,
  ): Promise<MatchHistoryEntry[]> {
    const entries = this.history
      .filter((e) => e.persistentId === persistentId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    return entries.map((e) => ({
      id: e.id,
      persistentId: e.persistentId,
      gameId: e.gameId,
      won: e.won,
      durationSeconds: e.durationSeconds,
      vaultCaptures: e.vaultCaptures,
      convoyDeliveries: e.convoyDeliveries,
      executionChains: e.executionChains,
      eloBefore: e.eloBefore,
      eloAfter: e.eloAfter,
      eloDelta: e.eloDelta,
      mapName: e.mapName,
      playerCount: e.playerCount,
      createdAt: new Date(e.createdAt).toISOString(),
    }));
  }

  /**
   * Get the global leaderboard, sorted by Elo descending.
   */
  async getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
    const sorted = Array.from(this.players.values())
      .filter((p) => p.matchesPlayed > 0)
      .sort((a, b) => b.eloRating - a.eloRating)
      .slice(0, limit);

    return sorted.map((p, idx) => ({
      persistentId: p.persistentId,
      displayName: p.displayName,
      eloRating: p.eloRating,
      rank: idx + 1,
      matchesPlayed: p.matchesPlayed,
      wins: p.wins,
    }));
  }

  /**
   * Get aggregate stats for a single player.
   */
  async getPlayerStats(persistentId: string): Promise<PlayerStats | null> {
    const rec = this.players.get(persistentId);
    if (!rec) return null;
    return {
      persistentId: rec.persistentId,
      displayName: rec.displayName,
      eloRating: rec.eloRating,
      matchesPlayed: rec.matchesPlayed,
      wins: rec.wins,
      losses: rec.losses,
      vaultCaptures: rec.vaultCaptures,
      convoyDeliveries: rec.convoyDeliveries,
      executionChains: rec.executionChains,
      surgeActivations: rec.surgeActivations,
      createdAt: new Date(rec.createdAt).toISOString(),
      updatedAt: new Date(rec.updatedAt).toISOString(),
    };
  }
}

export const playerStatsStore = new PlayerStatsStore();
