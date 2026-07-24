/**
 * Certified season-pass progression and entitlement ledger.
 *
 * Production truth lives in PostgreSQL. Development without DATABASE_URL uses
 * an explicitly labelled process-local fallback. A player/season/game tuple is
 * accepted once and claims create durable cosmetic entitlements—not imaginary
 * currency or a presentation-only boolean.
 */
import type { Pool } from "pg";
import { getDatabasePosture, pool } from "./db/pool";
import { logger } from "./Logger";

const log = logger.child({ comp: "CertifiedSeasonPassStore" });

export type SeasonMetric =
  | "matches_played"
  | "gold_delivered_k"
  | "vault_captures"
  | "convoy_deliveries"
  | "achievements_unlocked"
  | "chain_combos";

export interface SeasonMilestone {
  id: string;
  title: string;
  description: string;
  metric: SeasonMetric;
  target: number;
  reward: { type: "title" | "badge"; value: string };
  tier: number;
}

export const SEASON_MILESTONES: readonly SeasonMilestone[] = [
  {
    id: "m1",
    tier: 1,
    title: "First Steps",
    description: "Play 3 matches",
    metric: "matches_played",
    target: 3,
    reward: { type: "title", value: "Rookie" },
  },
  {
    id: "m2",
    tier: 2,
    title: "Getting Started",
    description: "Deliver 5 convoys",
    metric: "convoy_deliveries",
    target: 5,
    reward: { type: "badge", value: "bronze_convoy" },
  },
  {
    id: "m3",
    tier: 3,
    title: "Vault Seeker",
    description: "Capture 10 vault sites",
    metric: "vault_captures",
    target: 10,
    reward: { type: "title", value: "Vault Seeker" },
  },
  {
    id: "m4",
    tier: 4,
    title: "On the Road",
    description: "Play 15 matches",
    metric: "matches_played",
    target: 15,
    reward: { type: "badge", value: "road_badge" },
  },
  {
    id: "m5",
    tier: 5,
    title: "Chain Initiate",
    description: "Complete 3 execution chains",
    metric: "chain_combos",
    target: 3,
    reward: { type: "title", value: "Chain Initiate" },
  },
  {
    id: "m6",
    tier: 6,
    title: "Supply Master",
    description: "Deliver 25 convoys",
    metric: "convoy_deliveries",
    target: 25,
    reward: { type: "badge", value: "gold_truck" },
  },
  {
    id: "m7",
    tier: 7,
    title: "Vault Commander",
    description: "Capture 50 vault sites total",
    metric: "vault_captures",
    target: 50,
    reward: { type: "title", value: "Vault Commander" },
  },
  {
    id: "m8",
    tier: 8,
    title: "Veteran",
    description: "Play 40 matches this season",
    metric: "matches_played",
    target: 40,
    reward: { type: "badge", value: "veteran_crest" },
  },
  {
    id: "m9",
    tier: 9,
    title: "Chain Master",
    description: "Complete 10 execution chains",
    metric: "chain_combos",
    target: 10,
    reward: { type: "title", value: "Chain Master" },
  },
  {
    id: "m10",
    tier: 10,
    title: "Season Legend",
    description: "Unlock 5 achievements this season",
    metric: "achievements_unlocked",
    target: 5,
    reward: { type: "badge", value: "season_legend_badge" },
  },
];

export interface CertifiedSeasonPassOutcome {
  persistentId: string;
  vaultCaptures: number;
  convoyDeliveries: number;
  executionChains: number;
  achievementsUnlocked: number;
  goldDeliveredK?: number;
}

interface ProgressCounters {
  matches_played: number;
  gold_delivered_k: number;
  vault_captures: number;
  convoy_deliveries: number;
  achievements_unlocked: number;
  chain_combos: number;
}

export interface SeasonEntitlement {
  milestoneId: string;
  type: "title" | "badge";
  value: string;
  claimedAt: string;
}

export interface SeasonMilestoneProgress {
  milestone: SeasonMilestone;
  progress: number;
  target: number;
  pct: number;
  unlocked: boolean;
  claimed: boolean;
}

export interface CertifiedSeasonPassState {
  seasonId: string;
  milestones: SeasonMilestoneProgress[];
  entitlements: SeasonEntitlement[];
  evidence: "certified-match-result";
  durability: "postgres" | "process-local";
}

export interface SeasonPassClaimReceipt {
  claimed: boolean;
  reason: "claimed" | "already-claimed" | "locked" | "unknown-milestone";
  entitlement: SeasonEntitlement | null;
  durability: "postgres" | "process-local";
}

export interface SeasonPassStoreOptions {
  pool?: () => Pool | null;
  databaseConfigured?: () => boolean;
  now?: () => Date;
}

const EMPTY: Readonly<ProgressCounters> = {
  matches_played: 0,
  gold_delivered_k: 0,
  vault_captures: 0,
  convoy_deliveries: 0,
  achievements_unlocked: 0,
  chain_combos: 0,
};

function safeCount(value: number | undefined, floor = 0): number {
  return Number.isSafeInteger(value) && value! > floor
    ? Math.min(value!, 10_000)
    : floor;
}

function deriveCounters(outcome: CertifiedSeasonPassOutcome): ProgressCounters {
  return {
    matches_played: 1,
    gold_delivered_k: safeCount(outcome.goldDeliveredK),
    vault_captures: safeCount(outcome.vaultCaptures),
    convoy_deliveries: safeCount(outcome.convoyDeliveries),
    achievements_unlocked: safeCount(outcome.achievementsUnlocked),
    chain_combos: safeCount(outcome.executionChains),
  };
}

export class CertifiedSeasonPassStore {
  private readonly progress = new Map<string, ProgressCounters>();
  private readonly processed = new Set<string>();
  private readonly entitlements = new Map<
    string,
    Map<string, SeasonEntitlement>
  >();
  private readonly poolProvider: () => Pool | null;
  private readonly databaseConfigured: () => boolean;
  private readonly now: () => Date;

  constructor(options: SeasonPassStoreOptions = {}) {
    this.poolProvider = options.pool ?? (() => pool);
    this.databaseConfigured =
      options.databaseConfigured ?? (() => getDatabasePosture().configured);
    this.now = options.now ?? (() => new Date());
  }

  async getState(
    persistentId: string,
    seasonId: string,
  ): Promise<CertifiedSeasonPassState> {
    const database = this.poolProvider();
    if (database) {
      const [progressResult, entitlementResult] = await Promise.all([
        database.query(
          `SELECT matches_played, gold_delivered_k, vault_captures,
                  convoy_deliveries, achievements_unlocked, chain_combos
             FROM season_pass_progress
            WHERE persistent_id = $1 AND season_id = $2`,
          [persistentId, seasonId],
        ),
        database.query(
          `SELECT milestone_id, reward_type, reward_value, claimed_at
             FROM season_pass_entitlements
            WHERE persistent_id = $1 AND season_id = $2
            ORDER BY claimed_at, milestone_id`,
          [persistentId, seasonId],
        ),
      ]);
      return this.snapshot(
        seasonId,
        this.countersFromRow(progressResult.rows[0]),
        entitlementResult.rows.map((row) => this.entitlementFromRow(row)),
        "postgres",
      );
    }
    this.assertFallbackAvailable();
    const key = this.key(persistentId, seasonId);
    return this.snapshot(
      seasonId,
      this.progress.get(key) ?? EMPTY,
      [...(this.entitlements.get(key)?.values() ?? [])],
      "process-local",
    );
  }

  async recordCertifiedMatch(
    gameId: string,
    seasonId: string,
    outcome: CertifiedSeasonPassOutcome,
  ): Promise<CertifiedSeasonPassState | null> {
    const delta = deriveCounters(outcome);
    const database = this.poolProvider();
    if (database)
      return this.recordPostgres(
        database,
        gameId,
        seasonId,
        outcome.persistentId,
        delta,
      );
    this.assertFallbackAvailable();
    const eventKey = `${outcome.persistentId}:${seasonId}:${gameId}`;
    if (this.processed.has(eventKey)) return null;
    this.processed.add(eventKey);
    const key = this.key(outcome.persistentId, seasonId);
    this.progress.set(key, this.add(this.progress.get(key) ?? EMPTY, delta));
    return this.getState(outcome.persistentId, seasonId);
  }

  async claim(
    persistentId: string,
    seasonId: string,
    milestoneId: string,
  ): Promise<SeasonPassClaimReceipt> {
    const milestone = SEASON_MILESTONES.find((item) => item.id === milestoneId);
    if (!milestone)
      return this.claimReceipt(
        false,
        "unknown-milestone",
        null,
        this.poolProvider() ? "postgres" : "process-local",
      );
    const database = this.poolProvider();
    if (database)
      return this.claimPostgres(database, persistentId, seasonId, milestone);
    this.assertFallbackAvailable();
    const key = this.key(persistentId, seasonId);
    const existing = this.entitlements.get(key)?.get(milestoneId);
    if (existing)
      return this.claimReceipt(
        false,
        "already-claimed",
        existing,
        "process-local",
      );
    if ((this.progress.get(key)?.[milestone.metric] ?? 0) < milestone.target) {
      return this.claimReceipt(false, "locked", null, "process-local");
    }
    const entitlement = this.makeEntitlement(
      milestone,
      this.now().toISOString(),
    );
    const ledger =
      this.entitlements.get(key) ?? new Map<string, SeasonEntitlement>();
    ledger.set(milestoneId, entitlement);
    this.entitlements.set(key, ledger);
    return this.claimReceipt(true, "claimed", entitlement, "process-local");
  }

  private async recordPostgres(
    database: Pool,
    gameId: string,
    seasonId: string,
    persistentId: string,
    delta: ProgressCounters,
  ) {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO season_pass_events
           (persistent_id, season_id, game_id, matches_played, gold_delivered_k,
            vault_captures, convoy_deliveries, achievements_unlocked, chain_combos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT DO NOTHING RETURNING game_id`,
        [
          persistentId,
          seasonId,
          gameId,
          delta.matches_played,
          delta.gold_delivered_k,
          delta.vault_captures,
          delta.convoy_deliveries,
          delta.achievements_unlocked,
          delta.chain_combos,
        ],
      );
      if (inserted.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const updated = await client.query(
        `INSERT INTO season_pass_progress
           (persistent_id, season_id, matches_played, gold_delivered_k,
            vault_captures, convoy_deliveries, achievements_unlocked, chain_combos, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (persistent_id, season_id) DO UPDATE SET
           matches_played = season_pass_progress.matches_played + EXCLUDED.matches_played,
           gold_delivered_k = season_pass_progress.gold_delivered_k + EXCLUDED.gold_delivered_k,
           vault_captures = season_pass_progress.vault_captures + EXCLUDED.vault_captures,
           convoy_deliveries = season_pass_progress.convoy_deliveries + EXCLUDED.convoy_deliveries,
           achievements_unlocked = season_pass_progress.achievements_unlocked + EXCLUDED.achievements_unlocked,
           chain_combos = season_pass_progress.chain_combos + EXCLUDED.chain_combos,
           updated_at = NOW()
         RETURNING matches_played, gold_delivered_k, vault_captures,
                   convoy_deliveries, achievements_unlocked, chain_combos`,
        [
          persistentId,
          seasonId,
          delta.matches_played,
          delta.gold_delivered_k,
          delta.vault_captures,
          delta.convoy_deliveries,
          delta.achievements_unlocked,
          delta.chain_combos,
        ],
      );
      const entitlementResult = await client.query(
        `SELECT milestone_id, reward_type, reward_value, claimed_at
           FROM season_pass_entitlements
          WHERE persistent_id = $1 AND season_id = $2
          ORDER BY claimed_at, milestone_id`,
        [persistentId, seasonId],
      );
      await client.query("COMMIT");
      log.info("certified season pass progress recorded", {
        gameId,
        persistentId,
        seasonId,
      });
      return this.snapshot(
        seasonId,
        this.countersFromRow(updated.rows[0]),
        entitlementResult.rows.map((row) => this.entitlementFromRow(row)),
        "postgres",
      );
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async claimPostgres(
    database: Pool,
    persistentId: string,
    seasonId: string,
    milestone: SeasonMilestone,
  ): Promise<SeasonPassClaimReceipt> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const progress = await client.query(
        `SELECT ${milestone.metric} AS progress
           FROM season_pass_progress
          WHERE persistent_id = $1 AND season_id = $2
          FOR UPDATE`,
        [persistentId, seasonId],
      );
      if (Number(progress.rows[0]?.progress ?? 0) < milestone.target) {
        await client.query("ROLLBACK");
        return this.claimReceipt(false, "locked", null, "postgres");
      }
      const inserted = await client.query(
        `INSERT INTO season_pass_entitlements
           (persistent_id, season_id, milestone_id, reward_type, reward_value)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT DO NOTHING
         RETURNING milestone_id, reward_type, reward_value, claimed_at`,
        [
          persistentId,
          seasonId,
          milestone.id,
          milestone.reward.type,
          milestone.reward.value,
        ],
      );
      if (inserted.rowCount === 0) {
        const existing = await client.query(
          `SELECT milestone_id, reward_type, reward_value, claimed_at
             FROM season_pass_entitlements
            WHERE persistent_id = $1 AND season_id = $2 AND milestone_id = $3`,
          [persistentId, seasonId, milestone.id],
        );
        await client.query("ROLLBACK");
        return this.claimReceipt(
          false,
          "already-claimed",
          existing.rows[0] ? this.entitlementFromRow(existing.rows[0]) : null,
          "postgres",
        );
      }
      await client.query("COMMIT");
      const entitlement = this.entitlementFromRow(inserted.rows[0]);
      log.info("season pass entitlement claimed", {
        persistentId,
        seasonId,
        milestoneId: milestone.id,
      });
      return this.claimReceipt(true, "claimed", entitlement, "postgres");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private snapshot(
    seasonId: string,
    counters: Readonly<ProgressCounters>,
    entitlements: SeasonEntitlement[],
    durability: CertifiedSeasonPassState["durability"],
  ): CertifiedSeasonPassState {
    const claimed = new Set(entitlements.map((item) => item.milestoneId));
    return {
      seasonId,
      milestones: SEASON_MILESTONES.map((milestone) => {
        const progress = counters[milestone.metric];
        return {
          milestone,
          progress,
          target: milestone.target,
          pct: Math.min(100, Math.floor((progress / milestone.target) * 100)),
          unlocked: progress >= milestone.target,
          claimed: claimed.has(milestone.id),
        };
      }),
      entitlements,
      evidence: "certified-match-result",
      durability,
    };
  }

  private countersFromRow(row: any): ProgressCounters {
    if (!row) return { ...EMPTY };
    return {
      matches_played: Number(row.matches_played),
      gold_delivered_k: Number(row.gold_delivered_k),
      vault_captures: Number(row.vault_captures),
      convoy_deliveries: Number(row.convoy_deliveries),
      achievements_unlocked: Number(row.achievements_unlocked),
      chain_combos: Number(row.chain_combos),
    };
  }

  private entitlementFromRow(row: any): SeasonEntitlement {
    return {
      milestoneId: String(row.milestone_id),
      type: row.reward_type as "title" | "badge",
      value: String(row.reward_value),
      claimedAt: new Date(row.claimed_at).toISOString(),
    };
  }

  private makeEntitlement(
    milestone: SeasonMilestone,
    claimedAt: string,
  ): SeasonEntitlement {
    return { milestoneId: milestone.id, ...milestone.reward, claimedAt };
  }

  private claimReceipt(
    claimed: boolean,
    reason: SeasonPassClaimReceipt["reason"],
    entitlement: SeasonEntitlement | null,
    durability: SeasonPassClaimReceipt["durability"],
  ): SeasonPassClaimReceipt {
    return { claimed, reason, entitlement, durability };
  }

  private add(
    left: Readonly<ProgressCounters>,
    right: Readonly<ProgressCounters>,
  ): ProgressCounters {
    return {
      matches_played: left.matches_played + right.matches_played,
      gold_delivered_k: left.gold_delivered_k + right.gold_delivered_k,
      vault_captures: left.vault_captures + right.vault_captures,
      convoy_deliveries: left.convoy_deliveries + right.convoy_deliveries,
      achievements_unlocked:
        left.achievements_unlocked + right.achievements_unlocked,
      chain_combos: left.chain_combos + right.chain_combos,
    };
  }

  private assertFallbackAvailable(): void {
    if (this.databaseConfigured())
      throw new Error("season pass persistence unavailable");
  }

  private key(persistentId: string, seasonId: string): string {
    return `${persistentId}:${seasonId}`;
  }
}

export const certifiedSeasonPassStore = new CertifiedSeasonPassStore();
export const seasonMilestoneStore = certifiedSeasonPassStore;
