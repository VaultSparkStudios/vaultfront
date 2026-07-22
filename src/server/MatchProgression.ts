import { achievementStore, type AchievementEvent } from "./AchievementStore";
import {
  certifiedDailyMasteryStore,
  type DailyMasteryCompletionReceipt,
} from "./CertifiedDailyMasteryStore";
import { logger } from "./Logger";
import type { PlayerStats } from "./PlayerStatsStore";
import { playerStatsStore } from "./PlayerStatsStore";
import { predictionLeagueStore } from "./PredictionLeagueStore";
import { seasonMilestoneStore } from "./SeasonMilestoneStore";

const log = logger.child({ comp: "MatchProgression" });

export interface AuthoritativePlayerOutcome {
  persistentId: string;
  displayName: string;
  won: boolean;
  vaultCaptures: number;
  convoyDeliveries: number;
  convoyIntercepts: number;
  executionChains: number;
  surgeActivations: number;
}

export interface AuthoritativeMatchOutcome {
  gameId: string;
  durationSeconds: number;
  mapName: string;
  seasonId: string;
  onMutator: boolean;
  players: AuthoritativePlayerOutcome[];
}

export interface ProgressionReceipt {
  gameId: string;
  duplicate: boolean;
  playersRecorded: number;
  achievementsUnlocked: number;
  predictionOutcome: "intercept" | "delivery";
  predictionsResolved: number;
  dailyMastery: DailyMasteryCompletionReceipt[];
}

interface ProgressionDependencies {
  recordMatch: typeof playerStatsStore.recordMatch;
  getPlayerStats: (persistentId: string) => Promise<PlayerStats | null>;
  checkAndUnlock: typeof achievementStore.checkAndUnlock;
  recordSeasonActivity: typeof seasonMilestoneStore.recordActivity;
  resolvePrediction: typeof predictionLeagueStore.resolveGame;
  recordDailyMastery: typeof certifiedDailyMasteryStore.recordCertifiedMatch;
}

const defaultDependencies: ProgressionDependencies = {
  recordMatch: playerStatsStore.recordMatch.bind(playerStatsStore),
  getPlayerStats: playerStatsStore.getPlayerStats.bind(playerStatsStore),
  checkAndUnlock: achievementStore.checkAndUnlock.bind(achievementStore),
  recordSeasonActivity:
    seasonMilestoneStore.recordActivity.bind(seasonMilestoneStore),
  resolvePrediction: predictionLeagueStore.resolveGame.bind(
    predictionLeagueStore,
  ),
  recordDailyMastery: certifiedDailyMasteryStore.recordCertifiedMatch.bind(
    certifiedDailyMasteryStore,
  ),
};

export function derivePredictionOutcome(
  players: AuthoritativePlayerOutcome[],
): "intercept" | "delivery" {
  const deliveries = players.reduce(
    (total, player) => total + player.convoyDeliveries,
    0,
  );
  const intercepts = players.reduce(
    (total, player) => total + player.convoyIntercepts,
    0,
  );
  // A tie resolves toward delivery: the convoy survived at least as often as
  // it was stopped. This stable rule also makes empty telemetry deterministic.
  return deliveries >= intercepts ? "delivery" : "intercept";
}

/**
 * One authoritative match envelope fans into Elo/history, achievements, and
 * season milestones. The idempotency set intentionally claims only
 * process-lifetime safety: this does not pretend to be a durable event ledger.
 */
export class ServerAuthoritativeProgressionSpine {
  private readonly processedGameIds = new Set<string>();
  private readonly dependencies: ProgressionDependencies;

  constructor(dependencies: Partial<ProgressionDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  async record(
    outcome: AuthoritativeMatchOutcome,
  ): Promise<ProgressionReceipt> {
    if (this.processedGameIds.has(outcome.gameId)) {
      return {
        gameId: outcome.gameId,
        duplicate: true,
        playersRecorded: 0,
        achievementsUnlocked: 0,
        predictionOutcome: derivePredictionOutcome(outcome.players),
        predictionsResolved: 0,
        dailyMastery: [],
      };
    }

    // Claim before the first async side effect. If a downstream store fails,
    // retrying this envelope in-process could duplicate earlier fan-out legs.
    this.processedGameIds.add(outcome.gameId);
    const predictionOutcome = derivePredictionOutcome(outcome.players);
    const predictionReceipt = this.dependencies.resolvePrediction(
      outcome.gameId,
      predictionOutcome,
    );
    if (outcome.players.length === 0) {
      return {
        gameId: outcome.gameId,
        duplicate: false,
        playersRecorded: 0,
        achievementsUnlocked: 0,
        predictionOutcome,
        predictionsResolved: predictionReceipt.resolvedPredictions,
        dailyMastery: [],
      };
    }

    const allPlayers = outcome.players.map((player) => ({
      persistentId: player.persistentId,
      displayName: player.displayName,
      won: player.won,
    }));
    const statsByPersistentId = Object.fromEntries(
      outcome.players.map((player) => [
        player.persistentId,
        {
          vaultCaptures: player.vaultCaptures,
          convoyDeliveries: player.convoyDeliveries,
          executionChains: player.executionChains,
        },
      ]),
    );
    const subject = outcome.players[0];

    await this.dependencies.recordMatch(
      subject.persistentId,
      subject.displayName,
      outcome.gameId,
      {
        won: subject.won,
        durationSeconds: outcome.durationSeconds,
        vaultCaptures: subject.vaultCaptures,
        convoyDeliveries: subject.convoyDeliveries,
        executionChains: subject.executionChains,
        mapName: outcome.mapName,
        playerCount: outcome.players.length,
        allPlayers,
        statsByPersistentId,
      },
    );

    let achievementsUnlocked = 0;
    const dailyMastery: DailyMasteryCompletionReceipt[] = [];
    for (const player of outcome.players) {
      const aggregate = await this.dependencies.getPlayerStats(
        player.persistentId,
      );
      const events: AchievementEvent[] = [];
      if (player.vaultCaptures > 0) {
        events.push({ type: "vault_captured", count: player.vaultCaptures });
      }
      if (player.convoyDeliveries > 0) {
        events.push({
          type: "convoy_delivered",
          totalCount: aggregate?.convoyDeliveries ?? player.convoyDeliveries,
        });
      }
      if (player.executionChains > 0) {
        events.push({
          type: "execution_chain",
          matchCount: player.executionChains,
        });
      }
      if (player.surgeActivations > 0) {
        events.push({ type: "surge_activated" });
      }
      events.push({
        type: "match_played",
        totalMatches: aggregate?.matchesPlayed ?? 1,
      });
      events.push({
        type: "match_ended",
        won: player.won,
        durationSeconds: outcome.durationSeconds,
        onMutator: outcome.onMutator,
        eloRating: aggregate?.eloRating ?? 1200,
      });

      let playerUnlocks = 0;
      for (const event of events) {
        playerUnlocks += this.dependencies.checkAndUnlock(
          player.persistentId,
          event,
        ).length;
      }
      achievementsUnlocked += playerUnlocks;

      this.dependencies.recordSeasonActivity(
        player.persistentId,
        outcome.seasonId,
        "matches_played",
      );
      if (player.vaultCaptures > 0) {
        this.dependencies.recordSeasonActivity(
          player.persistentId,
          outcome.seasonId,
          "vault_captures",
          player.vaultCaptures,
        );
      }
      if (player.convoyDeliveries > 0) {
        this.dependencies.recordSeasonActivity(
          player.persistentId,
          outcome.seasonId,
          "convoy_deliveries",
          player.convoyDeliveries,
        );
      }
      if (player.executionChains > 0) {
        this.dependencies.recordSeasonActivity(
          player.persistentId,
          outcome.seasonId,
          "chain_combos",
          player.executionChains,
        );
      }
      if (playerUnlocks > 0) {
        this.dependencies.recordSeasonActivity(
          player.persistentId,
          outcome.seasonId,
          "achievements_unlocked",
          playerUnlocks,
        );
      }
      const masteryReceipt = await this.dependencies.recordDailyMastery(
        outcome.gameId,
        player,
      );
      if (masteryReceipt) {
        dailyMastery.push(masteryReceipt);
      }
    }

    const receipt = {
      gameId: outcome.gameId,
      duplicate: false,
      playersRecorded: outcome.players.length,
      achievementsUnlocked,
      predictionOutcome,
      predictionsResolved: predictionReceipt.resolvedPredictions,
      dailyMastery,
    };
    log.info("authoritative progression recorded", receipt);
    return receipt;
  }
}

export const matchProgressionSpine = new ServerAuthoritativeProgressionSpine();
