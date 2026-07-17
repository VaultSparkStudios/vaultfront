import { Counter, metrics } from "@opentelemetry/api";
import { logger } from "./Logger";

export const VAULT_METRIC_ATTRIBUTE_KEYS = [
  "duration_bucket",
  "gold_tier",
  "player_count_bucket",
] as const;

type VaultMetricAttributeKey = (typeof VAULT_METRIC_ATTRIBUTE_KEYS)[number];
type VaultMetricAttributes = Partial<Record<VaultMetricAttributeKey, string>>;

const vaultMetricAttributeKeys = new Set<string>(VAULT_METRIC_ATTRIBUTE_KEYS);

export function assertVaultMetricAttributes(
  attributes: Record<string, unknown>,
): asserts attributes is VaultMetricAttributes {
  for (const key of Object.keys(attributes)) {
    if (!vaultMetricAttributeKeys.has(key)) {
      throw new Error("Disallowed VaultMetrics attribute: " + key);
    }
  }
}

class CardinalitySafeCounter {
  constructor(private readonly counter: Counter) {}

  add(value: number, attributes: VaultMetricAttributes = {}): void {
    assertVaultMetricAttributes(attributes);
    this.counter.add(value, attributes);
  }
}

interface VaultCounters {
  vaultCaptured: CardinalitySafeCounter;
  convoyDelivered: CardinalitySafeCounter;
  executionChainCompleted: CardinalitySafeCounter;
  surgeActivated: CardinalitySafeCounter;
  matchStarted: CardinalitySafeCounter;
  matchEnded: CardinalitySafeCounter;
  achievementUnlocked: CardinalitySafeCounter;
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
    logger.debug("VaultMetrics." + method + " called before init(), skipping");
    return null;
  }
  return counters;
}

export const VaultMetrics = {
  init(meterName: string = "vaultfront-game-events"): void {
    const meter = metrics.getMeter(meterName);

    counters = {
      vaultCaptured: new CardinalitySafeCounter(
        meter.createCounter("vaultfront.vault_captured", {
          description: "Number of vault capture events",
        }),
      ),
      convoyDelivered: new CardinalitySafeCounter(
        meter.createCounter("vaultfront.convoy_delivered", {
          description:
            "Number of convoy delivery events, broken down by gold tier",
        }),
      ),
      executionChainCompleted: new CardinalitySafeCounter(
        meter.createCounter("vaultfront.execution_chain_completed", {
          description: "Number of 3-step execution chain completions",
        }),
      ),
      surgeActivated: new CardinalitySafeCounter(
        meter.createCounter("vaultfront.surge_activated", {
          description: "Number of surge activations",
        }),
      ),
      matchStarted: new CardinalitySafeCounter(
        meter.createCounter("vaultfront.match_started", {
          description:
            "Number of matches started, broken down by player-count bucket",
        }),
      ),
      matchEnded: new CardinalitySafeCounter(
        meter.createCounter("vaultfront.match_ended", {
          description:
            "Number of matches ended, broken down by duration bucket",
        }),
      ),
      achievementUnlocked: new CardinalitySafeCounter(
        meter.createCounter("vaultfront.achievement_unlocked", {
          description: "Number of achievement unlock events",
        }),
      ),
    };

    logger.info("VaultMetrics initialized", { meterName });
  },

  recordVaultCaptured(_gameId: string): void {
    const c = assertInitialized("recordVaultCaptured");
    if (!c) return;
    c.vaultCaptured.add(1);
  },

  recordConvoyDelivered(_gameId: string, goldReward: bigint): void {
    const c = assertInitialized("recordConvoyDelivered");
    if (!c) return;
    c.convoyDelivered.add(1, {
      gold_tier: goldTier(goldReward),
    });
  },

  recordExecutionChainCompleted(_gameId: string): void {
    const c = assertInitialized("recordExecutionChainCompleted");
    if (!c) return;
    c.executionChainCompleted.add(1);
  },

  recordSurgeActivated(_gameId: string): void {
    const c = assertInitialized("recordSurgeActivated");
    if (!c) return;
    c.surgeActivated.add(1);
  },

  recordMatchStarted(
    _gameId: string,
    _mapName: string,
    playerCount: number,
  ): void {
    const c = assertInitialized("recordMatchStarted");
    if (!c) return;
    c.matchStarted.add(1, {
      player_count_bucket: playerCountBucket(playerCount),
    });
  },

  recordMatchEnded(_gameId: string, durationSeconds: number): void {
    const c = assertInitialized("recordMatchEnded");
    if (!c) return;
    c.matchEnded.add(1, {
      duration_bucket: durationBucket(durationSeconds),
    });
  },

  recordAchievementUnlocked(_achievementId: string): void {
    const c = assertInitialized("recordAchievementUnlocked");
    if (!c) return;
    c.achievementUnlocked.add(1);
  },

  /**
   * Record aggregate per-game stats after a match ends.
   * Call once from archiveGame() with totals summed across all players.
   */
  recordMatchAggregates(
    _gameId: string,
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
      c.vaultCaptured.add(totals.vaultCaptures);
    }
    if (totals.convoyDeliveries > 0) {
      c.convoyDelivered.add(totals.convoyDeliveries);
    }
    if (totals.executionChains > 0) {
      c.executionChainCompleted.add(totals.executionChains);
    }
    if (totals.surgeActivations > 0) {
      c.surgeActivated.add(totals.surgeActivations);
    }
  },
};
