/**
 * Daily mastery derived exclusively from server-certified match outcomes.
 *
 * PostgreSQL provides durable, cross-process exactly-once semantics. Local
 * development uses a process-local fallback and exposes that scope in every
 * snapshot and completion receipt.
 */
import type { Pool } from "pg";
import { getDatabasePosture, pool } from "./db/pool";
import { logger } from "./Logger";

const log = logger.child({ comp: "CertifiedDailyMasteryStore" });

export type CertifiedMasteryMetric =
  | "wins"
  | "vault_captures"
  | "convoy_deliveries"
  | "convoy_intercepts"
  | "execution_chains"
  | "surge_activations";

export interface DailyMasteryDefinition {
  id: string;
  description: string;
  metric: CertifiedMasteryMetric;
  target: number;
  rewardMastery: number;
}

export interface DailyMasterySnapshot {
  challengeId: string;
  description: string;
  progress: number;
  target: number;
  rewardMastery: number;
  completed: boolean;
  masteryBalance: number;
  dateUtc: string;
  evidence: "certified-match-result";
  durability: "postgres" | "process-local";
}

export interface DailyMasteryCompletionReceipt {
  persistentId: string;
  challengeId: string;
  dateUtc: string;
  progress: number;
  target: number;
  rewardMastery: number;
  completedNow: boolean;
  masteryBalance: number;
  durability: "postgres" | "process-local";
}

export interface CertifiedMasteryOutcome {
  persistentId: string;
  won: boolean;
  vaultCaptures: number;
  convoyDeliveries: number;
  convoyIntercepts: number;
  executionChains: number;
  surgeActivations: number;
}

const CHALLENGES: readonly DailyMasteryDefinition[] = [
  {
    id: "intercept-3",
    description: "Intercept 3 enemy convoys",
    metric: "convoy_intercepts",
    target: 3,
    rewardMastery: 60,
  },
  {
    id: "vault-5",
    description: "Capture 5 vault sites",
    metric: "vault_captures",
    target: 5,
    rewardMastery: 50,
  },
  {
    id: "deliver-5",
    description: "Deliver 5 convoys safely",
    metric: "convoy_deliveries",
    target: 5,
    rewardMastery: 50,
  },
  {
    id: "chain-3",
    description: "Execute 3 clean convoy chains",
    metric: "execution_chains",
    target: 3,
    rewardMastery: 65,
  },
  {
    id: "surge-2",
    description: "Activate Surge twice",
    metric: "surge_activations",
    target: 2,
    rewardMastery: 55,
  },
  {
    id: "victory-1",
    description: "Win a certified match",
    metric: "wins",
    target: 1,
    rewardMastery: 75,
  },
] as const;

interface MemoryProgress {
  progress: number;
  completed: boolean;
}

export interface DailyMasteryStoreOptions {
  now?: () => Date;
  pool?: () => Pool | null;
  databaseConfigured?: () => boolean;
}

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function metricAmount(
  outcome: CertifiedMasteryOutcome,
  metric: CertifiedMasteryMetric,
): number {
  if (metric === "wins") return outcome.won ? 1 : 0;
  const fields = {
    vault_captures: "vaultCaptures",
    convoy_deliveries: "convoyDeliveries",
    convoy_intercepts: "convoyIntercepts",
    execution_chains: "executionChains",
    surge_activations: "surgeActivations",
  } as const;
  return safeCount(outcome[fields[metric]]);
}

export class CertifiedDailyMasteryStore {
  private readonly progress = new Map<string, MemoryProgress>();
  private readonly processed = new Set<string>();
  private readonly balances = new Map<string, number>();
  private readonly now: () => Date;
  private readonly poolProvider: () => Pool | null;
  private readonly databaseConfigured: () => boolean;

  constructor(options: DailyMasteryStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.poolProvider = options.pool ?? (() => pool);
    this.databaseConfigured =
      options.databaseConfigured ?? (() => getDatabasePosture().configured);
  }

  private dateUtc(): string {
    return this.now().toISOString().slice(0, 10);
  }

  private definition(dateUtc: string): DailyMasteryDefinition {
    let seed = 0;
    for (const char of dateUtc) {
      seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    }
    return CHALLENGES[seed % CHALLENGES.length];
  }

  private progressKey(persistentId: string, dateUtc: string): string {
    return `${persistentId}:${dateUtc}`;
  }

  async getChallenge(persistentId: string): Promise<DailyMasterySnapshot> {
    const dateUtc = this.dateUtc();
    const challenge = this.definition(dateUtc);
    const database = this.poolProvider();
    if (database) {
      const result = await database.query(
        `SELECT p.progress, p.completed_at,
                COALESCE(w.mastery_balance, 0) AS mastery_balance
           FROM (SELECT $1::varchar AS persistent_id) subject
           LEFT JOIN daily_mastery_progress p
             ON p.persistent_id = subject.persistent_id
            AND p.challenge_date = $2::date
           LEFT JOIN daily_mastery_wallet w
             ON w.persistent_id = subject.persistent_id`,
        [persistentId, dateUtc],
      );
      const row = result.rows[0] ?? {};
      return this.snapshot(
        challenge,
        dateUtc,
        Number(row.progress ?? 0),
        Boolean(row.completed_at),
        Number(row.mastery_balance ?? 0),
        "postgres",
      );
    }
    if (this.databaseConfigured()) {
      throw new Error("daily mastery persistence unavailable");
    }
    const state = this.progress.get(this.progressKey(persistentId, dateUtc));
    return this.snapshot(
      challenge,
      dateUtc,
      state?.progress ?? 0,
      state?.completed ?? false,
      this.balances.get(persistentId) ?? 0,
      "process-local",
    );
  }

  async recordCertifiedMatch(
    gameId: string,
    outcome: CertifiedMasteryOutcome,
  ): Promise<DailyMasteryCompletionReceipt | null> {
    const dateUtc = this.dateUtc();
    const challenge = this.definition(dateUtc);
    const amount = metricAmount(outcome, challenge.metric);
    const database = this.poolProvider();
    if (database) {
      return this.recordPostgres(
        database,
        gameId,
        outcome.persistentId,
        dateUtc,
        challenge,
        amount,
      );
    }
    if (this.databaseConfigured()) {
      throw new Error("daily mastery persistence unavailable");
    }
    return this.recordMemory(
      gameId,
      outcome.persistentId,
      dateUtc,
      challenge,
      amount,
    );
  }

  private recordMemory(
    gameId: string,
    persistentId: string,
    dateUtc: string,
    challenge: DailyMasteryDefinition,
    amount: number,
  ): DailyMasteryCompletionReceipt | null {
    const eventKey = `${persistentId}:${dateUtc}:${gameId}`;
    if (this.processed.has(eventKey)) return null;
    this.processed.add(eventKey);
    const key = this.progressKey(persistentId, dateUtc);
    const prior = this.progress.get(key) ?? { progress: 0, completed: false };
    const progress = Math.min(challenge.target, prior.progress + amount);
    const completedNow = !prior.completed && progress >= challenge.target;
    this.progress.set(key, {
      progress,
      completed: prior.completed || completedNow,
    });
    const masteryBalance =
      (this.balances.get(persistentId) ?? 0) +
      (completedNow ? challenge.rewardMastery : 0);
    this.balances.set(persistentId, masteryBalance);
    return this.receipt(
      persistentId,
      challenge,
      dateUtc,
      progress,
      completedNow,
      masteryBalance,
      "process-local",
    );
  }

  private async recordPostgres(
    database: Pool,
    gameId: string,
    persistentId: string,
    dateUtc: string,
    challenge: DailyMasteryDefinition,
    amount: number,
  ): Promise<DailyMasteryCompletionReceipt | null> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO daily_mastery_events
           (persistent_id, challenge_date, game_id, challenge_id, metric, amount)
         VALUES ($1, $2::date, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING RETURNING game_id`,
        [persistentId, dateUtc, gameId, challenge.id, challenge.metric, amount],
      );
      if (inserted.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const priorResult = await client.query(
        `SELECT progress, completed_at
           FROM daily_mastery_progress
          WHERE persistent_id = $1 AND challenge_date = $2::date
          FOR UPDATE`,
        [persistentId, dateUtc],
      );
      const prior = priorResult.rows[0];
      const progress = Math.min(
        challenge.target,
        Number(prior?.progress ?? 0) + amount,
      );
      const completedNow = !prior?.completed_at && progress >= challenge.target;
      await client.query(
        `INSERT INTO daily_mastery_progress
           (persistent_id, challenge_date, challenge_id, progress, target,
            reward_mastery, completed_at, updated_at)
         VALUES ($1, $2::date, $3, $4, $5, $6,
                 CASE WHEN $7 THEN NOW() ELSE NULL END, NOW())
         ON CONFLICT (persistent_id, challenge_date) DO UPDATE
           SET progress = EXCLUDED.progress,
               completed_at = COALESCE(
                 daily_mastery_progress.completed_at,
                 EXCLUDED.completed_at
               ),
               updated_at = NOW()`,
        [
          persistentId,
          dateUtc,
          challenge.id,
          progress,
          challenge.target,
          challenge.rewardMastery,
          completedNow,
        ],
      );
      let masteryBalance = 0;
      if (completedNow) {
        const wallet = await client.query(
          `INSERT INTO daily_mastery_wallet
             (persistent_id, mastery_balance, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (persistent_id) DO UPDATE
             SET mastery_balance =
                   daily_mastery_wallet.mastery_balance +
                   EXCLUDED.mastery_balance,
                 updated_at = NOW()
           RETURNING mastery_balance`,
          [persistentId, challenge.rewardMastery],
        );
        masteryBalance = Number(wallet.rows[0].mastery_balance);
      } else {
        const wallet = await client.query(
          "SELECT mastery_balance FROM daily_mastery_wallet WHERE persistent_id = $1",
          [persistentId],
        );
        masteryBalance = Number(wallet.rows[0]?.mastery_balance ?? 0);
      }
      await client.query("COMMIT");
      return this.receipt(
        persistentId,
        challenge,
        dateUtc,
        progress,
        completedNow,
        masteryBalance,
        "postgres",
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private snapshot(
    challenge: DailyMasteryDefinition,
    dateUtc: string,
    progress: number,
    completed: boolean,
    masteryBalance: number,
    durability: DailyMasterySnapshot["durability"],
  ): DailyMasterySnapshot {
    return {
      challengeId: challenge.id,
      description: challenge.description,
      progress,
      target: challenge.target,
      rewardMastery: challenge.rewardMastery,
      completed,
      masteryBalance,
      dateUtc,
      evidence: "certified-match-result",
      durability,
    };
  }

  private receipt(
    persistentId: string,
    challenge: DailyMasteryDefinition,
    dateUtc: string,
    progress: number,
    completedNow: boolean,
    masteryBalance: number,
    durability: DailyMasteryCompletionReceipt["durability"],
  ): DailyMasteryCompletionReceipt {
    const receipt = {
      persistentId,
      challengeId: challenge.id,
      dateUtc,
      progress,
      target: challenge.target,
      rewardMastery: challenge.rewardMastery,
      completedNow,
      masteryBalance,
      durability,
    };
    if (completedNow) {
      log.info("certified daily mastery completed", receipt);
    }
    return receipt;
  }
}

export const certifiedDailyMasteryStore = new CertifiedDailyMasteryStore();
