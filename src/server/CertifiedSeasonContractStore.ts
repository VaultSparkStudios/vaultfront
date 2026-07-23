/**
 * Seasonal contract progress derived exclusively from certified match results.
 *
 * PostgreSQL is the authoritative production ledger. Local development uses an
 * explicitly labelled process-local fallback. Each player/season/game tuple is
 * accepted once, so retries cannot inflate a visible progression promise.
 */
import type { Pool } from "pg";
import { getDatabasePosture, pool } from "./db/pool";
import { logger } from "./Logger";

const log = logger.child({ comp: "CertifiedSeasonContractStore" });

export interface CertifiedSeasonContractOutcome {
  persistentId: string;
  vaultCaptures: number;
  convoyDeliveries: number;
  convoyIntercepts: number;
  convoysLost: number;
  surgeActivations: number;
}

export interface CertifiedSeasonContractState {
  seasonId: string;
  interceptionTiming: number;
  objectiveDenial: number;
  comebackExecution: number;
  surgeExecution: number;
  evidence: "certified-match-result";
  durability: "postgres" | "process-local";
}

export interface SeasonContractStoreOptions {
  pool?: () => Pool | null;
  databaseConfigured?: () => boolean;
}

type ProgressCounters = Omit<
  CertifiedSeasonContractState,
  "seasonId" | "evidence" | "durability"
>;

const EMPTY_PROGRESS: Readonly<ProgressCounters> = {
  interceptionTiming: 0,
  objectiveDenial: 0,
  comebackExecution: 0,
  surgeExecution: 0,
};

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 10_000) : 0;
}

function deriveProgress(
  outcome: CertifiedSeasonContractOutcome,
): ProgressCounters {
  const vaultCaptures = safeCount(outcome.vaultCaptures);
  const convoyDeliveries = safeCount(outcome.convoyDeliveries);
  const convoyIntercepts = safeCount(outcome.convoyIntercepts);
  const convoysLost = safeCount(outcome.convoysLost);
  return {
    interceptionTiming: convoyIntercepts,
    objectiveDenial: Math.min(10_000, vaultCaptures + convoyIntercepts),
    comebackExecution: convoysLost > 0 && convoyDeliveries > 0 ? 1 : 0,
    surgeExecution: safeCount(outcome.surgeActivations),
  };
}

export class CertifiedSeasonContractStore {
  private readonly progress = new Map<string, ProgressCounters>();
  private readonly processed = new Set<string>();
  private readonly poolProvider: () => Pool | null;
  private readonly databaseConfigured: () => boolean;

  constructor(options: SeasonContractStoreOptions = {}) {
    this.poolProvider = options.pool ?? (() => pool);
    this.databaseConfigured =
      options.databaseConfigured ?? (() => getDatabasePosture().configured);
  }

  async getState(
    persistentId: string,
    seasonId: string,
  ): Promise<CertifiedSeasonContractState> {
    const database = this.poolProvider();
    if (database) {
      const result = await database.query(
        `SELECT interception_timing, objective_denial,
                comeback_execution, surge_execution
           FROM season_contract_progress
          WHERE persistent_id = $1 AND season_id = $2`,
        [persistentId, seasonId],
      );
      const row = result.rows[0];
      return this.snapshot(
        seasonId,
        row
          ? {
              interceptionTiming: Number(row.interception_timing),
              objectiveDenial: Number(row.objective_denial),
              comebackExecution: Number(row.comeback_execution),
              surgeExecution: Number(row.surge_execution),
            }
          : EMPTY_PROGRESS,
        "postgres",
      );
    }
    this.assertFallbackAvailable();
    return this.snapshot(
      seasonId,
      this.progress.get(this.key(persistentId, seasonId)) ?? EMPTY_PROGRESS,
      "process-local",
    );
  }

  async recordCertifiedMatch(
    gameId: string,
    seasonId: string,
    outcome: CertifiedSeasonContractOutcome,
  ): Promise<CertifiedSeasonContractState | null> {
    const delta = deriveProgress(outcome);
    const database = this.poolProvider();
    if (database) {
      return this.recordPostgres(
        database,
        gameId,
        seasonId,
        outcome.persistentId,
        delta,
      );
    }
    this.assertFallbackAvailable();
    const eventKey = `${outcome.persistentId}:${seasonId}:${gameId}`;
    if (this.processed.has(eventKey)) return null;
    this.processed.add(eventKey);
    const key = this.key(outcome.persistentId, seasonId);
    const prior = this.progress.get(key) ?? EMPTY_PROGRESS;
    const next = this.add(prior, delta);
    this.progress.set(key, next);
    return this.snapshot(seasonId, next, "process-local");
  }

  private async recordPostgres(
    database: Pool,
    gameId: string,
    seasonId: string,
    persistentId: string,
    delta: ProgressCounters,
  ): Promise<CertifiedSeasonContractState | null> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO season_contract_events
           (persistent_id, season_id, game_id, interception_timing,
            objective_denial, comeback_execution, surge_execution)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING
         RETURNING game_id`,
        [
          persistentId,
          seasonId,
          gameId,
          delta.interceptionTiming,
          delta.objectiveDenial,
          delta.comebackExecution,
          delta.surgeExecution,
        ],
      );
      if (inserted.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const updated = await client.query(
        `INSERT INTO season_contract_progress
           (persistent_id, season_id, interception_timing, objective_denial,
            comeback_execution, surge_execution, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (persistent_id, season_id) DO UPDATE
           SET interception_timing =
                 season_contract_progress.interception_timing +
                 EXCLUDED.interception_timing,
               objective_denial =
                 season_contract_progress.objective_denial +
                 EXCLUDED.objective_denial,
               comeback_execution =
                 season_contract_progress.comeback_execution +
                 EXCLUDED.comeback_execution,
               surge_execution =
                 season_contract_progress.surge_execution +
                 EXCLUDED.surge_execution,
               updated_at = NOW()
         RETURNING interception_timing, objective_denial,
                   comeback_execution, surge_execution`,
        [
          persistentId,
          seasonId,
          delta.interceptionTiming,
          delta.objectiveDenial,
          delta.comebackExecution,
          delta.surgeExecution,
        ],
      );
      await client.query("COMMIT");
      const row = updated.rows[0];
      const state = this.snapshot(
        seasonId,
        {
          interceptionTiming: Number(row.interception_timing),
          objectiveDenial: Number(row.objective_denial),
          comebackExecution: Number(row.comeback_execution),
          surgeExecution: Number(row.surge_execution),
        },
        "postgres",
      );
      log.info("certified seasonal contracts recorded", {
        gameId,
        persistentId,
        seasonId,
      });
      return state;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private assertFallbackAvailable(): void {
    if (this.databaseConfigured()) {
      throw new Error("season contract persistence unavailable");
    }
  }

  private key(persistentId: string, seasonId: string): string {
    return `${persistentId}:${seasonId}`;
  }

  private add(
    left: Readonly<ProgressCounters>,
    right: Readonly<ProgressCounters>,
  ): ProgressCounters {
    return {
      interceptionTiming: left.interceptionTiming + right.interceptionTiming,
      objectiveDenial: left.objectiveDenial + right.objectiveDenial,
      comebackExecution: left.comebackExecution + right.comebackExecution,
      surgeExecution: left.surgeExecution + right.surgeExecution,
    };
  }

  private snapshot(
    seasonId: string,
    progress: Readonly<ProgressCounters>,
    durability: CertifiedSeasonContractState["durability"],
  ): CertifiedSeasonContractState {
    return {
      seasonId,
      ...progress,
      evidence: "certified-match-result",
      durability,
    };
  }
}

export const certifiedSeasonContractStore = new CertifiedSeasonContractStore();
