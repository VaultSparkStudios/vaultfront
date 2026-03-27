import { Counter, metrics } from "@opentelemetry/api";
import { logger } from "./Logger";

interface VaultCounters {
  vaultCaptured: Counter;
  convoyDelivered: Counter;
  executionChainCompleted: Counter;
  surgeActivated: Counter;
  matchStarted: Counter;
  matchEnded: Counter;
  achievementUnlocked: Counter;
}

let counters: VaultCounters | null = null;

function playerCountBucket(n: number): "2-10" | "11-30" | "31-60" | "61+" {
  if (n <= 10) return "2-10";
  if (n <= 30) return "11-30";
  if (n <= 60) return "31-60";
  return "61+";
}

function durationBucket(seconds: number): "<5m" | "5-15m" | "15-30m" | ">30m" {
  if (seconds < 300) return "<5m";
  if (seconds < 900) return "5-15m";
  if (seconds < 1800) return "15-30m";
  return ">30m";
}

function goldTier(goldReward: bigint): "low" | "mid" | "high" {
  if (goldReward < BigInt(500)) return "low";
  if (goldReward < BigInt(2000)) return "mid";
  return "high";
}

function assertInitialized(method: string): VaultCounters | null {
  if (counters === null) {
    logger.debug(`VaultMetrics.${method} called before init(), skipping`);
    return null;
  }
  return counters;
}

export const VaultMetrics = {
  init(meterName: string = "vaultfront-game-events"): void {
    const meter = metrics.getMeter(meterName);

    counters = {
      vaultCaptured: meter.createCounter("vaultfront.vault_captured", {
        description: "Number of vault capture events",
      }),
      convoyDelivered: meter.createCounter("vaultfront.convoy_delivered", {
        description:
          "Number of convoy delivery events, broken down by gold tier",
      }),
      executionChainCompleted: meter.createCounter(
        "vaultfront.execution_chain_completed",
        {
          description: "Number of 3-step execution chain completions",
        },
      ),
      surgeActivated: meter.createCounter("vaultfront.surge_activated", {
        description: "Number of surge activations",
      }),
      matchStarted: meter.createCounter("vaultfront.match_started", {
        description: "Number of matches started",
      }),
      matchEnded: meter.createCounter("vaultfront.match_ended", {
        description: "Number of matches ended, broken down by duration bucket",
      }),
      achievementUnlocked: meter.createCounter(
        "vaultfront.achievement_unlocked",
        {
          description: "Number of achievement unlocks per achievement",
        },
      ),
    };

    logger.info("VaultMetrics initialized", { meterName });
  },

  recordVaultCaptured(gameId: string): void {
    const c = assertInitialized("recordVaultCaptured");
    if (!c) return;
    c.vaultCaptured.add(1, { "game.id": gameId });
  },

  recordConvoyDelivered(gameId: string, goldReward: bigint): void {
    const c = assertInitialized("recordConvoyDelivered");
    if (!c) return;
    c.convoyDelivered.add(1, {
      "game.id": gameId,
      gold_tier: goldTier(goldReward),
    });
  },

  recordExecutionChainCompleted(gameId: string): void {
    const c = assertInitialized("recordExecutionChainCompleted");
    if (!c) return;
    c.executionChainCompleted.add(1, { "game.id": gameId });
  },

  recordSurgeActivated(gameId: string): void {
    const c = assertInitialized("recordSurgeActivated");
    if (!c) return;
    c.surgeActivated.add(1, { "game.id": gameId });
  },

  recordMatchStarted(
    gameId: string,
    mapName: string,
    playerCount: number,
  ): void {
    const c = assertInitialized("recordMatchStarted");
    if (!c) return;
    c.matchStarted.add(1, {
      "game.id": gameId,
      map_name: mapName,
      player_count_bucket: playerCountBucket(playerCount),
    });
  },

  recordMatchEnded(gameId: string, durationSeconds: number): void {
    const c = assertInitialized("recordMatchEnded");
    if (!c) return;
    c.matchEnded.add(1, {
      "game.id": gameId,
      duration_bucket: durationBucket(durationSeconds),
    });
  },

  recordAchievementUnlocked(achievementId: string): void {
    const c = assertInitialized("recordAchievementUnlocked");
    if (!c) return;
    c.achievementUnlocked.add(1, { achievement_id: achievementId });
  },

  /**
   * Record aggregate per-game stats after a match ends.
   * Call once from archiveGame() with totals summed across all players.
   */
  recordMatchAggregates(
    gameId: string,
    totals: {
      vaultCaptures: number;
      convoyDeliveries: number;
      executionChains: number;
      surgeActivations: number;
    },
  ): void {
    const c = assertInitialized("recordMatchAggregates");
    if (!c) return;
    if (totals.vaultCaptures > 0) {
      c.vaultCaptured.add(totals.vaultCaptures, { "game.id": gameId });
    }
    if (totals.convoyDeliveries > 0) {
      c.convoyDelivered.add(totals.convoyDeliveries, { "game.id": gameId });
    }
    if (totals.executionChains > 0) {
      c.executionChainCompleted.add(totals.executionChains, {
        "game.id": gameId,
      });
    }
    if (totals.surgeActivations > 0) {
      c.surgeActivated.add(totals.surgeActivations, { "game.id": gameId });
    }
  },
};
