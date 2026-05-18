/**
 * SeasonMilestoneStore — tracks season pass progression per player.
 *
 * 10 milestone tiers, each requiring a cumulative activity threshold.
 * Cosmetic rewards only. Progress is aggregated from match activity events.
 */

import { logger } from "./Logger";

export interface SeasonMilestone {
  id: string;
  title: string;
  description: string;
  /** Activity metric type */
  metric:
    | "matches_played"
    | "gold_delivered_k"
    | "vault_captures"
    | "convoy_deliveries"
    | "achievements_unlocked"
    | "chain_combos";
  target: number;
  reward: { type: "title" | "badge" | "gold_bonus"; value: string };
  tier: number; // 1–10
}

export const SEASON_MILESTONES: SeasonMilestone[] = [
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

interface PlayerSeasonProgress {
  persistentId: string;
  seasonId: string;
  matches_played: number;
  gold_delivered_k: number;
  vault_captures: number;
  convoy_deliveries: number;
  achievements_unlocked: number;
  chain_combos: number;
  claimedMilestones: Set<string>;
}

class SeasonMilestoneStore {
  private progress = new Map<string, PlayerSeasonProgress>();

  private key(persistentId: string, seasonId: string): string {
    return `${persistentId}:${seasonId}`;
  }

  private getOrCreate(
    persistentId: string,
    seasonId: string,
  ): PlayerSeasonProgress {
    const k = this.key(persistentId, seasonId);
    const existing = this.progress.get(k);
    if (existing) return existing;
    const rec: PlayerSeasonProgress = {
      persistentId,
      seasonId,
      matches_played: 0,
      gold_delivered_k: 0,
      vault_captures: 0,
      convoy_deliveries: 0,
      achievements_unlocked: 0,
      chain_combos: 0,
      claimedMilestones: new Set(),
    };
    this.progress.set(k, rec);
    return rec;
  }

  recordActivity(
    persistentId: string,
    seasonId: string,
    metric: SeasonMilestone["metric"],
    amount = 1,
  ): void {
    const rec = this.getOrCreate(persistentId, seasonId);
    rec[metric] = (rec[metric] as number) + amount;
  }

  getProgress(
    persistentId: string,
    seasonId: string,
  ): Array<{
    milestone: SeasonMilestone;
    progress: number;
    target: number;
    pct: number;
    unlocked: boolean;
    claimed: boolean;
  }> {
    const rec = this.getOrCreate(persistentId, seasonId);
    return SEASON_MILESTONES.map((m) => {
      const current = rec[m.metric] as number;
      return {
        milestone: m,
        progress: current,
        target: m.target,
        pct: Math.min(100, Math.floor((current / m.target) * 100)),
        unlocked: current >= m.target,
        claimed: rec.claimedMilestones.has(m.id),
      };
    });
  }

  claim(persistentId: string, seasonId: string, milestoneId: string): boolean {
    const rec = this.getOrCreate(persistentId, seasonId);
    const milestone = SEASON_MILESTONES.find((m) => m.id === milestoneId);
    if (!milestone) return false;
    if (rec.claimedMilestones.has(milestoneId)) return false; // already claimed
    const current = rec[milestone.metric] as number;
    if (current < milestone.target) return false; // not yet earned
    rec.claimedMilestones.add(milestoneId);
    logger.info("season-milestone claimed", {
      persistentId,
      seasonId,
      milestoneId,
    });
    return true;
  }
}

export const seasonMilestoneStore = new SeasonMilestoneStore();
