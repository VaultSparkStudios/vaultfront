/**
 * VaultSeasonScheduler — authoritative weekly mutator rotation and community voting.
 *
 * Responsibilities:
 *  - Determines the current weekly mutator from UTC week number (same formula
 *    as pages-stub/index.html but server-authoritative).
 *  - Announces new mutators to Discord when the week rolls over.
 *  - Opens a Discord community vote on Sunday 12:00 UTC for next week's mutator.
 *  - Closes the vote on Monday 00:00 UTC and announces the winner.
 *  - Exposes getStatus() for the /api/season/current endpoint.
 */

import { pool } from "./db/pool";
import { DiscordNotifier } from "./DiscordNotifier";
import { logger } from "./Logger";
import { playerStatsStore } from "./PlayerStatsStore";

const log = logger.child({ comp: "VaultSeasonScheduler" });

// ── Mutator definitions ────────────────────────────────────────────────────

interface MutatorDef {
  key: string;
  name: string;
  description: string;
}

const MUTATOR_DEFS: Record<string, MutatorDef> = {
  none: {
    key: "none",
    name: "Standard Rules",
    description: "No modifier active — baseline VaultFront gameplay.",
  },
  lane_fog: {
    key: "lane_fog",
    name: "Lane Fog",
    description: "Convoy routes are obscured until scouts clear the path.",
  },
  accelerated_cooldowns: {
    key: "accelerated_cooldowns",
    name: "Accelerated Cooldowns",
    description: "Vault capture and beacon cooldowns run 30% faster this week.",
  },
  double_passive: {
    key: "double_passive",
    name: "Double Passive",
    description: "Vault passive gold income is doubled — economy accelerates.",
  },
  gold_rush: {
    key: "gold_rush",
    name: "Gold Rush",
    description:
      "Convoy gold rewards are boosted +50% — high-stakes extraction.",
  },
  blitz: {
    key: "blitz",
    name: "Blitz",
    description: "Vault capture time reduced 40% — control windows close fast.",
  },
  no_mercy: {
    key: "no_mercy",
    name: "No Mercy",
    description: "Escort shields are disabled — every convoy is exposed.",
  },
  contested: {
    key: "contested",
    name: "Contested",
    description: "Vault capture progress decays when holder leaves proximity.",
  },
  shield_escort: {
    key: "shield_escort",
    name: "Shielded Run",
    description: "All launched convoys start with 2 escort shields.",
  },
  rally_point: {
    key: "rally_point",
    name: "Rally Point",
    description:
      "Passive vault income doubled; vault captures grant extra troops.",
  },
  execution_rush: {
    key: "execution_rush",
    name: "Execution Rush",
    description:
      "Chain window doubled; clean execution convoy multiplier ×1.5.",
  },
};

// Rotation excludes "none" — same filter as the client-side JS
const ROTATION_KEYS: string[] = [
  "lane_fog",
  "accelerated_cooldowns",
  "double_passive",
  "gold_rush",
  "blitz",
  "no_mercy",
  "contested",
  "shield_escort",
  "rally_point",
  "execution_rush",
];

// ── Public API types ───────────────────────────────────────────────────────

export interface SeasonStatus {
  currentMutator: { key: string; name: string; description: string };
  weekNumber: number;
  mutatorEndsAt: number; // Unix ms timestamp of next Monday 00:00 UTC
  vote: {
    open: boolean;
    candidates: Array<{ key: string; name: string }>;
    closesAt: number | null;
  } | null;
}

// ── Internal vote state ────────────────────────────────────────────────────

interface VoteState {
  candidates: string[];
  votes: Map<string, number>;
  openUntil: number; // Unix ms
  announced: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the ISO-style week-of-year for a given UTC date (0-indexed), using
 * the same formula as pages-stub/index.html:
 *   weekNum = floor((now - startOfYear) / 7d)
 */
function utcWeekNumber(now: Date): number {
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  return Math.floor((now.getTime() - startOfYear) / (7 * 24 * 60 * 60 * 1000));
}

/** Returns the mutator key for a given week number. */
function mutatorKeyForWeek(weekNum: number): string {
  return ROTATION_KEYS[weekNum % ROTATION_KEYS.length];
}

/** Returns Unix ms timestamp of the next Monday 00:00 UTC after `now`. */
function nextMondayUtcMs(now: Date): number {
  const dayOfWeek = now.getUTCDay(); // 0=Sun … 6=Sat
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilMonday,
    0,
    0,
    0,
    0,
  );
  return nextMonday;
}

/** Returns Unix ms timestamp of the coming Sunday 12:00 UTC (or this Sunday if it hasn't passed). */
function thisSundayNoonUtcMs(now: Date): number {
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilSunday,
    12,
    0,
    0,
    0,
  );
}

// ── Scheduler class ────────────────────────────────────────────────────────

class VaultSeasonScheduler {
  private lastAnnouncedWeek: number | null = null;
  private currentVote: VoteState | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /** Call once on server startup. */
  start(): void {
    log.info("VaultSeasonScheduler starting");
    this.tick();
    // Check every hour
    this.intervalHandle = setInterval(
      () => {
        this.tick();
      },
      60 * 60 * 1000,
    );
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ── Tick ──────────────────────────────────────────────────────────────

  private tick(): void {
    const now = new Date();
    const weekNum = utcWeekNumber(now);
    const mutatorKey = mutatorKeyForWeek(weekNum);
    const mutator = MUTATOR_DEFS[mutatorKey];

    // Announce if new week
    if (this.lastAnnouncedWeek !== weekNum) {
      log.info(`New week ${weekNum}: mutator=${mutatorKey}`);
      if (mutator) {
        DiscordNotifier.weeklyMutatorAnnounced(
          mutator.name,
          mutator.description,
          weekNum,
        );
      }
      this.lastAnnouncedWeek = weekNum;

      // Close any open vote and post result
      this.maybeCloseVote(now);
    }

    // Open vote window: Sunday 12:00 UTC → Monday 00:00 UTC
    this.maybeOpenVote(now, weekNum);
  }

  // ── Vote management ───────────────────────────────────────────────────

  private maybeOpenVote(now: Date, currentWeek: number): void {
    const dayOfWeek = now.getUTCDay(); // 0=Sun
    if (dayOfWeek !== 0) return; // only on Sunday

    const sundayNoon = thisSundayNoonUtcMs(now);
    const closeAt = nextMondayUtcMs(now);

    if (now.getTime() < sundayNoon) return; // before noon, not yet
    if (now.getTime() >= closeAt) return; // already past Monday

    // Vote should be open. Check if we already opened one this week.
    if (this.currentVote !== null && this.currentVote.openUntil === closeAt) {
      return; // already open for this window
    }

    // Candidates = all three rotation keys for next week's possible mutators
    const nextWeekNum = currentWeek + 1;
    const nextKey = mutatorKeyForWeek(nextWeekNum);
    // Offer all three rotation options (shuffle based on nextWeekNum for variety)
    const offset = nextWeekNum % ROTATION_KEYS.length;
    const candidates = [
      ROTATION_KEYS[offset % ROTATION_KEYS.length],
      ROTATION_KEYS[(offset + 1) % ROTATION_KEYS.length],
      ROTATION_KEYS[(offset + 2) % ROTATION_KEYS.length],
    ];
    void nextKey; // deterministic winner will be the scheduled one; vote is advisory

    const votes = new Map<string, number>();
    for (const c of candidates) {
      votes.set(c, 0);
    }

    this.currentVote = {
      candidates,
      votes,
      openUntil: closeAt,
      announced: false,
    };

    if (!this.currentVote.announced) {
      this.openWeeklyVote();
    }
  }

  private maybeCloseVote(now: Date): void {
    if (this.currentVote === null) return;
    if (now.getTime() < this.currentVote.openUntil) return;

    const winner = this.getWinner();
    if (winner !== null) {
      const winnerDef = MUTATOR_DEFS[winner.key];
      const totalVotes = Array.from(this.currentVote.votes.values()).reduce(
        (a, b) => a + b,
        0,
      );
      if (winnerDef) {
        DiscordNotifier.voteResultPosted(
          winnerDef.name,
          winner.votes,
          totalVotes,
        );
      }
    }

    this.currentVote = null;

    // Seasonal soft-reset: pull all Elo ratings toward default by up to 200 pts
    void playerStatsStore
      .seasonalSoftReset()
      .catch((err) =>
        log.error("seasonalSoftReset failed", { err: String(err) }),
      );

    // Dynasty award: top-rated player earns the season emblem
    void playerStatsStore.getTopRatedPlayer().then(async (top) => {
      if (!top) return;
      const emblems = ["👑", "🔱", "⚡", "🌑", "🔥", "💠"];
      const emblem = emblems[this.getStatus().weekNumber % emblems.length];
      await playerStatsStore.awardDynasty(top.persistentId, emblem);
      log.info("dynasty awarded", {
        persistentId: top.persistentId,
        displayName: top.displayName,
        elo: top.eloRating,
        emblem,
      });
    });
  }

  openWeeklyVote(): void {
    if (this.currentVote === null) return;
    const candidates = this.currentVote.candidates
      .map((k) => MUTATOR_DEFS[k])
      .filter((d): d is MutatorDef => d !== undefined)
      .map((d) => ({ key: d.key, name: d.name }));

    DiscordNotifier.weeklyVoteOpened(
      candidates,
      new Date(this.currentVote.openUntil),
    );
    this.currentVote.announced = true;
  }

  // ── Public methods ─────────────────────────────────────────────────────

  /**
   * Increments the vote count for a candidate key.
   * No-ops if the vote is not open or the candidate is invalid.
   * @param voterId - anonymized player ID used for deduplication in Postgres.
   */
  recordVote(candidateKey: string, voterId?: string): void {
    if (this.currentVote === null) return;
    if (Date.now() >= this.currentVote.openUntil) return;
    if (!this.currentVote.candidates.includes(candidateKey)) return;

    const current = this.currentVote.votes.get(candidateKey) ?? 0;
    this.currentVote.votes.set(candidateKey, current + 1);

    // Persist to Postgres (fire-and-forget; one vote per voter per week)
    if (pool && voterId) {
      const now = new Date();
      const weekNum = utcWeekNumber(now);
      pool
        .query(
          `INSERT INTO season_votes (week_number, voter_id, candidate_key)
           VALUES ($1, $2, $3) ON CONFLICT (week_number, voter_id) DO NOTHING`,
          [weekNum, voterId, candidateKey],
        )
        .catch((err) =>
          log.error("Failed to persist season vote", {
            voterId,
            candidateKey,
            err: String(err),
          }),
        );
    }
  }

  /**
   * Load this week's votes from Postgres into in-memory state.
   * Call once at startup so vote counts survive server restarts.
   */
  async loadVotesFromDb(): Promise<void> {
    if (!pool || !this.currentVote) return;
    const weekNum = utcWeekNumber(new Date());
    try {
      const res = await pool.query<{ candidate_key: string; count: string }>(
        `SELECT candidate_key, COUNT(*) AS count
         FROM season_votes
         WHERE week_number = $1
         GROUP BY candidate_key`,
        [weekNum],
      );
      for (const row of res.rows) {
        const existing = this.currentVote.votes.get(row.candidate_key) ?? 0;
        this.currentVote.votes.set(
          row.candidate_key,
          existing + parseInt(row.count, 10),
        );
      }
      log.info("Loaded season votes from DB", { weekNum, rows: res.rowCount });
    } catch (err) {
      log.error("Failed to load season votes from DB", { err: String(err) });
    }
  }

  /** Returns the winning candidate or null if vote is still open or no votes cast. */
  getWinner(): { key: string; votes: number } | null {
    if (this.currentVote === null) return null;
    if (Date.now() < this.currentVote.openUntil) return null; // still open

    let winnerKey: string | null = null;
    let winnerVotes = -1;

    for (const [key, count] of this.currentVote.votes.entries()) {
      if (count > winnerVotes) {
        winnerVotes = count;
        winnerKey = key;
      }
    }

    if (winnerKey === null || winnerVotes === 0) return null;
    return { key: winnerKey, votes: winnerVotes };
  }

  /** Returns the full season status for the API. */
  getStatus(): SeasonStatus {
    const now = new Date();
    const weekNum = utcWeekNumber(now);
    const mutatorKey = mutatorKeyForWeek(weekNum);
    const mutator = MUTATOR_DEFS[mutatorKey] ?? MUTATOR_DEFS["none"];
    const mutatorEndsAt = nextMondayUtcMs(now);

    let vote: SeasonStatus["vote"] = null;
    if (this.currentVote !== null && Date.now() < this.currentVote.openUntil) {
      vote = {
        open: true,
        candidates: this.currentVote.candidates
          .map((k) => MUTATOR_DEFS[k])
          .filter((d): d is MutatorDef => d !== undefined)
          .map((d) => ({ key: d.key, name: d.name })),
        closesAt: this.currentVote.openUntil,
      };
    }

    return {
      currentMutator: {
        key: mutator.key,
        name: mutator.name,
        description: mutator.description,
      },
      weekNumber: weekNum,
      mutatorEndsAt,
      vote,
    };
  }
}

export const vaultSeasonScheduler = new VaultSeasonScheduler();
