/**
 * DailyChallengeStore — daily objective system with bonus gold rewards.
 *
 * - New challenge generated each UTC midnight using a seeded selection.
 * - Progress tracked in-memory per persistentId per day.
 * - Award bonus gold on completion (awarded once per player per day).
 */

import { logger } from "./Logger";

const log = logger.child({ comp: "DailyChallengeStore" });

// ── Challenge pool ────────────────────────────────────────────────────────────

interface ChallengeDef {
  id: string;
  description: string;
  activity: string; // activity label to track
  target: number;
  rewardGold: number;
}

const CHALLENGE_POOL: ChallengeDef[] = [
  {
    id: "intercept_3",
    description: "Intercept 3 enemy convoys",
    activity: "convoy_intercepted",
    target: 3,
    rewardGold: 500,
  },
  {
    id: "vault_sites_5",
    description: "Control 5 vault sites simultaneously",
    activity: "vault_captured",
    target: 5,
    rewardGold: 450,
  },
  {
    id: "ghost_route_1",
    description: "Complete a ghost route",
    activity: "ghost_reveal",
    target: 1,
    rewardGold: 400,
  },
  {
    id: "last_stand_2",
    description: "Trigger Last Stand twice",
    activity: "last_stand",
    target: 2,
    rewardGold: 600,
  },
  {
    id: "convoy_deliver_5",
    description: "Deliver 5 convoys safely",
    activity: "convoy_delivered",
    target: 5,
    rewardGold: 350,
  },
  {
    id: "chain_3",
    description: "Execute 3 convoy chains",
    activity: "convoy_chain",
    target: 3,
    rewardGold: 550,
  },
  {
    id: "escort_3",
    description: "Escort 3 convoys",
    activity: "convoy_escorted",
    target: 3,
    rewardGold: 400,
  },
  {
    id: "bounty_collect_1",
    description: "Collect a bounty",
    activity: "bounty_collected",
    target: 1,
    rewardGold: 480,
  },
];

// ── Per-player progress ───────────────────────────────────────────────────────

interface PlayerChallengeProgress {
  challengeId: string;
  progress: number;
  completed: boolean;
  awardedAt: number | null;
}

// ── Store ─────────────────────────────────────────────────────────────────────

class DailyChallengeStore {
  private currentChallenge: ChallengeDef;
  private currentDateUtc: string;
  private progress = new Map<string, PlayerChallengeProgress>();

  constructor() {
    this.currentDateUtc = this.todayUtc();
    this.currentChallenge = this.pickChallenge(this.currentDateUtc);
    log.info("DailyChallengeStore initialised", {
      challenge: this.currentChallenge.id,
    });
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private pickChallenge(dateStr: string): ChallengeDef {
    // Deterministic seed from the date string
    let seed = 0;
    for (let i = 0; i < dateStr.length; i++) seed += dateStr.charCodeAt(i);
    return CHALLENGE_POOL[seed % CHALLENGE_POOL.length];
  }

  private maybeRollover(): void {
    const today = this.todayUtc();
    if (today !== this.currentDateUtc) {
      this.currentDateUtc = today;
      this.currentChallenge = this.pickChallenge(today);
      this.progress.clear();
      log.info("DailyChallengeStore rolled over", {
        challenge: this.currentChallenge.id,
        date: today,
      });
    }
  }

  getChallenge(persistentId: string): {
    challengeId: string;
    description: string;
    progress: number;
    target: number;
    rewardGold: number;
    completed: boolean;
  } {
    this.maybeRollover();
    const ch = this.currentChallenge;
    const p = this.progress.get(persistentId) ?? {
      challengeId: ch.id,
      progress: 0,
      completed: false,
      awardedAt: null,
    };
    return {
      challengeId: ch.id,
      description: ch.description,
      progress: p.progress,
      target: ch.target,
      rewardGold: ch.rewardGold,
      completed: p.completed,
    };
  }

  /**
   * Record an activity event for a player. Returns bonus gold if challenge
   * just completed (0 otherwise).
   */
  recordActivity(persistentId: string, activity: string): number {
    this.maybeRollover();
    const ch = this.currentChallenge;
    if (activity !== ch.activity) return 0;

    const existing = this.progress.get(persistentId) ?? {
      challengeId: ch.id,
      progress: 0,
      completed: false,
      awardedAt: null,
    };

    if (existing.completed) return 0;

    existing.progress = Math.min(existing.progress + 1, ch.target);
    if (existing.progress >= ch.target && !existing.completed) {
      existing.completed = true;
      existing.awardedAt = Date.now();
      this.progress.set(persistentId, existing);
      log.info("Daily challenge completed", {
        persistentId,
        challengeId: ch.id,
        reward: ch.rewardGold,
      });
      return ch.rewardGold;
    }

    this.progress.set(persistentId, existing);
    return 0;
  }
}

export const dailyChallengeStore = new DailyChallengeStore();
