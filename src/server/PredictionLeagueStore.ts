/**
 * Durable, match-bound spectator prediction ledger.
 *
 * PostgreSQL is authoritative when configured. The bounded process-local path
 * is used only for explicitly database-free development and identifies its
 * durability in every receipt.
 */
import type { Pool, PoolClient } from "pg";
import { logger } from "./Logger";
import { getDatabasePosture, pool } from "./db/pool";

export type PredictionOutcome = "intercept" | "delivery";

export interface Prediction {
  gameId: string;
  spectatorId: string;
  predictedOutcome: PredictionOutcome;
  actualOutcome?: PredictionOutcome;
  resolved: boolean;
  correct?: boolean;
  timestamp: number;
  weekKey: string;
}

export interface SpectatorLeaderboardEntry {
  spectatorId: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  weeklyScore: number;
  allTimeScore: number;
  currentWeekKey: string;
}

export interface PredictionSubmissionReceipt {
  gameId: string;
  accepted: boolean;
  reason: "accepted" | "duplicate-or-closed";
  durability: "postgres" | "process-local";
}

export interface PredictionResolutionReceipt {
  gameId: string;
  actualOutcome: PredictionOutcome;
  resolvedPredictions: number;
  durability: "postgres" | "process-local";
}

export interface PredictionConsensus {
  gameId: string;
  intercept: number;
  delivery: number;
  total: number;
  interceptPct: number;
  deliveryPct: number;
  status: "open" | "resolved";
  durability: "postgres" | "process-local";
}

export interface PredictionLeagueStoreOptions {
  pool?: () => Pool | null;
  databaseConfigured?: () => boolean;
  now?: () => number;
  maxMemoryPredictions?: number;
}

export function getPredictionWeekKey(ts = Date.now()): string {
  const date = new Date(ts);
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${utc.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

export class PredictionLeagueStore {
  private readonly pending = new Map<string, Map<string, Prediction>>();
  private readonly history = new Map<string, Prediction[]>();
  private readonly resolvedGames = new Set<string>();
  private readonly poolProvider: () => Pool | null;
  private readonly databaseConfigured: () => boolean;
  private readonly now: () => number;
  private readonly maxMemoryPredictions: number;

  constructor(options: PredictionLeagueStoreOptions = {}) {
    this.poolProvider = options.pool ?? (() => pool);
    this.databaseConfigured =
      options.databaseConfigured ?? (() => getDatabasePosture().configured);
    this.now = options.now ?? (() => Date.now());
    this.maxMemoryPredictions = options.maxMemoryPredictions ?? 10_000;
  }

  async recordPrediction(
    gameId: string,
    spectatorId: string,
    outcome: PredictionOutcome,
  ): Promise<PredictionSubmissionReceipt> {
    const normalizedGameId = gameId.trim().slice(0, 64);
    const normalizedSpectatorId = spectatorId.trim().slice(0, 64);
    if (!normalizedGameId || !normalizedSpectatorId) {
      return this.submission(normalizedGameId, false, "process-local");
    }
    const database = this.poolProvider();
    if (database) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await this.lockGame(client, normalizedGameId);
        const result = await client.query(
          `INSERT INTO prediction_league_predictions
             (game_id, spectator_id, predicted_outcome, submitted_at, week_key)
           SELECT $1, $2, $3, to_timestamp($4 / 1000.0), $5
            WHERE NOT EXISTS (
              SELECT 1 FROM prediction_league_games WHERE game_id = $1
            )
           ON CONFLICT DO NOTHING
           RETURNING game_id`,
          [
            normalizedGameId,
            normalizedSpectatorId,
            outcome,
            this.now(),
            getPredictionWeekKey(this.now()),
          ],
        );
        await client.query("COMMIT");
        return this.submission(
          normalizedGameId,
          result.rowCount === 1,
          "postgres",
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    this.assertFallbackAvailable();
    const gamePredictions =
      this.pending.get(normalizedGameId) ?? new Map<string, Prediction>();
    const accepted =
      !this.resolvedGames.has(normalizedGameId) &&
      !gamePredictions.has(normalizedSpectatorId);
    if (accepted) {
      const timestamp = this.now();
      gamePredictions.set(normalizedSpectatorId, {
        gameId: normalizedGameId,
        spectatorId: normalizedSpectatorId,
        predictedOutcome: outcome,
        resolved: false,
        timestamp,
        weekKey: getPredictionWeekKey(timestamp),
      });
      this.pending.set(normalizedGameId, gamePredictions);
      this.trimMemory();
    }
    return this.submission(normalizedGameId, accepted, "process-local");
  }

  async resolveGame(
    gameId: string,
    actualOutcome: PredictionOutcome,
  ): Promise<PredictionResolutionReceipt> {
    const database = this.poolProvider();
    if (database) return this.resolvePostgres(database, gameId, actualOutcome);
    this.assertFallbackAvailable();
    if (this.resolvedGames.has(gameId)) {
      return this.resolution(gameId, actualOutcome, 0, "process-local");
    }
    this.resolvedGames.add(gameId);
    const gamePredictions = this.pending.get(gameId);
    if (!gamePredictions) {
      return this.resolution(gameId, actualOutcome, 0, "process-local");
    }
    for (const prediction of gamePredictions.values()) {
      prediction.actualOutcome = actualOutcome;
      prediction.resolved = true;
      prediction.correct = prediction.predictedOutcome === actualOutcome;
      const spectatorHistory = this.history.get(prediction.spectatorId) ?? [];
      spectatorHistory.push(prediction);
      if (spectatorHistory.length > 500) spectatorHistory.shift();
      this.history.set(prediction.spectatorId, spectatorHistory);
    }
    this.pending.delete(gameId);
    logger.info("prediction-league resolved", {
      gameId,
      actualOutcome,
      count: gamePredictions.size,
      durability: "process-local",
    });
    return this.resolution(
      gameId,
      actualOutcome,
      gamePredictions.size,
      "process-local",
    );
  }

  async getLeaderboard(
    limit = 10,
    weekOnly = false,
  ): Promise<SpectatorLeaderboardEntry[]> {
    const boundedLimit = Math.min(50, Math.max(1, Math.floor(limit) || 10));
    const currentWeek = getPredictionWeekKey(this.now());
    const database = this.poolProvider();
    if (database) {
      const result = await database.query(
        `SELECT spectator_id,
                COUNT(*) FILTER (WHERE NOT $2 OR week_key = $3)::int AS total,
                COUNT(*) FILTER (WHERE correct AND (NOT $2 OR week_key = $3))::int AS correct,
                COUNT(*) FILTER (WHERE correct AND week_key = $3)::int AS weekly,
                COUNT(*) FILTER (WHERE correct)::int AS all_time
           FROM prediction_league_predictions
          WHERE resolved_at IS NOT NULL
          GROUP BY spectator_id
         HAVING COUNT(*) FILTER (WHERE NOT $2 OR week_key = $3) >= 2
          ORDER BY (COUNT(*) FILTER (WHERE correct AND (NOT $2 OR week_key = $3)))::float /
                   NULLIF(COUNT(*) FILTER (WHERE NOT $2 OR week_key = $3), 0) DESC,
                   COUNT(*) FILTER (WHERE NOT $2 OR week_key = $3) DESC
          LIMIT $1`,
        [boundedLimit, weekOnly, currentWeek],
      );
      return result.rows.map((row) =>
        this.entry(
          String(row.spectator_id),
          Number(row.total),
          Number(row.correct),
          Number(row.weekly),
          Number(row.all_time),
          currentWeek,
        ),
      );
    }
    this.assertFallbackAvailable();
    return [...this.history.keys()]
      .map((spectatorId) => this.getMemoryStats(spectatorId, weekOnly))
      .filter((entry): entry is SpectatorLeaderboardEntry =>
        Boolean(entry && entry.totalPredictions >= 2),
      )
      .sort(
        (a, b) =>
          b.accuracy - a.accuracy || b.totalPredictions - a.totalPredictions,
      )
      .slice(0, boundedLimit);
  }

  async getSpectatorStats(
    spectatorId: string,
  ): Promise<SpectatorLeaderboardEntry | null> {
    const database = this.poolProvider();
    const currentWeek = getPredictionWeekKey(this.now());
    if (database) {
      const result = await database.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE correct)::int AS correct,
                COUNT(*) FILTER (WHERE correct AND week_key = $2)::int AS weekly
           FROM prediction_league_predictions
          WHERE spectator_id = $1 AND resolved_at IS NOT NULL`,
        [spectatorId, currentWeek],
      );
      const row = result.rows[0];
      const total = Number(row?.total ?? 0);
      return total === 0
        ? null
        : this.entry(
            spectatorId,
            total,
            Number(row.correct),
            Number(row.weekly),
            Number(row.correct),
            currentWeek,
          );
    }
    this.assertFallbackAvailable();
    return this.getMemoryStats(spectatorId, false);
  }

  async getGameConsensus(gameId: string): Promise<PredictionConsensus> {
    const database = this.poolProvider();
    if (database) {
      const result = await database.query(
        `SELECT COUNT(*) FILTER (WHERE predicted_outcome = 'intercept')::int AS intercept,
                COUNT(*) FILTER (WHERE predicted_outcome = 'delivery')::int AS delivery,
                EXISTS(SELECT 1 FROM prediction_league_games WHERE game_id = $1) AS resolved
           FROM prediction_league_predictions
          WHERE game_id = $1`,
        [gameId],
      );
      const row = result.rows[0];
      return this.consensus(
        gameId,
        Number(row?.intercept ?? 0),
        Number(row?.delivery ?? 0),
        row?.resolved === true,
        "postgres",
      );
    }
    this.assertFallbackAvailable();
    const predictions = this.pending.get(gameId);
    let intercept = 0;
    let delivery = 0;
    for (const prediction of predictions?.values() ?? []) {
      if (prediction.predictedOutcome === "intercept") intercept += 1;
      else delivery += 1;
    }
    if (!predictions && this.resolvedGames.has(gameId)) {
      for (const history of this.history.values()) {
        for (const prediction of history) {
          if (prediction.gameId !== gameId) continue;
          if (prediction.predictedOutcome === "intercept") intercept += 1;
          else delivery += 1;
        }
      }
    }
    return this.consensus(
      gameId,
      intercept,
      delivery,
      this.resolvedGames.has(gameId),
      "process-local",
    );
  }

  private async resolvePostgres(
    database: Pool,
    gameId: string,
    actualOutcome: PredictionOutcome,
  ): Promise<PredictionResolutionReceipt> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await this.lockGame(client, gameId);
      const game = await client.query(
        `INSERT INTO prediction_league_games (game_id, actual_outcome)
         VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING game_id`,
        [gameId, actualOutcome],
      );
      if (game.rowCount === 0) {
        await client.query("ROLLBACK");
        return this.resolution(gameId, actualOutcome, 0, "postgres");
      }
      const resolved = await client.query(
        `UPDATE prediction_league_predictions
            SET actual_outcome = $2,
                correct = predicted_outcome = $2,
                resolved_at = NOW()
          WHERE game_id = $1 AND resolved_at IS NULL
          RETURNING spectator_id`,
        [gameId, actualOutcome],
      );
      await client.query("COMMIT");
      return this.resolution(
        gameId,
        actualOutcome,
        resolved.rowCount ?? 0,
        "postgres",
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private lockGame(client: PoolClient, gameId: string): Promise<unknown> {
    return client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [gameId]);
  }

  private getMemoryStats(
    spectatorId: string,
    weekOnly: boolean,
  ): SpectatorLeaderboardEntry | null {
    const resolved = (this.history.get(spectatorId) ?? []).filter(
      (prediction) => prediction.resolved,
    );
    if (resolved.length === 0) return null;
    const currentWeek = getPredictionWeekKey(this.now());
    const scoped = weekOnly
      ? resolved.filter((prediction) => prediction.weekKey === currentWeek)
      : resolved;
    if (scoped.length === 0) return null;
    return this.entry(
      spectatorId,
      scoped.length,
      scoped.filter((prediction) => prediction.correct).length,
      resolved.filter(
        (prediction) =>
          prediction.weekKey === currentWeek && prediction.correct,
      ).length,
      resolved.filter((prediction) => prediction.correct).length,
      currentWeek,
    );
  }

  private entry(
    spectatorId: string,
    total: number,
    correct: number,
    weekly: number,
    allTime: number,
    currentWeekKey: string,
  ): SpectatorLeaderboardEntry {
    return {
      spectatorId,
      totalPredictions: total,
      correctPredictions: correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      weeklyScore: weekly,
      allTimeScore: allTime,
      currentWeekKey,
    };
  }

  private submission(
    gameId: string,
    accepted: boolean,
    durability: PredictionSubmissionReceipt["durability"],
  ): PredictionSubmissionReceipt {
    return {
      gameId,
      accepted,
      reason: accepted ? "accepted" : "duplicate-or-closed",
      durability,
    };
  }

  private resolution(
    gameId: string,
    actualOutcome: PredictionOutcome,
    resolvedPredictions: number,
    durability: PredictionResolutionReceipt["durability"],
  ): PredictionResolutionReceipt {
    return { gameId, actualOutcome, resolvedPredictions, durability };
  }

  private consensus(
    gameId: string,
    intercept: number,
    delivery: number,
    resolved: boolean,
    durability: PredictionConsensus["durability"],
  ): PredictionConsensus {
    const total = intercept + delivery;
    const interceptPct = total > 0 ? Math.round((intercept / total) * 100) : 50;
    return {
      gameId,
      intercept,
      delivery,
      total,
      interceptPct,
      deliveryPct: 100 - interceptPct,
      status: resolved ? "resolved" : "open",
      durability,
    };
  }

  private trimMemory(): void {
    let total = [...this.pending.values()].reduce(
      (count, predictions) => count + predictions.size,
      0,
    );
    while (total > this.maxMemoryPredictions) {
      const oldestGameId = this.pending.keys().next().value;
      if (oldestGameId === undefined) break;
      total -= this.pending.get(oldestGameId)?.size ?? 0;
      this.pending.delete(oldestGameId);
    }
  }

  private assertFallbackAvailable(): void {
    if (this.databaseConfigured()) {
      throw new Error("prediction league persistence unavailable");
    }
  }
}

export const predictionLeagueStore = new PredictionLeagueStore();
