/**
 * AchievementStore — server-side achievement definitions, progress tracking,
 * and unlock detection for VaultFront.
 *
 * Architecture:
 * - All state is in-memory (Map per persistentId). Persistence across restarts
 *   is out of scope for this module — hook into a DB layer if needed later.
 * - checkAndUnlock() is the single entry point; call it from game-event
 *   handlers and it returns any newly unlocked achievements.
 * - reset() is provided for testing isolation.
 */

import { logger } from "./Logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
}

export interface AchievementProgress {
  id: string;
  unlockedAt: number | null;
  /** 0–100 percent toward unlock */
  progress: number;
  /** Human-readable label, e.g. "7 / 10 convoys" */
  progressLabel: string;
}

export type AchievementEvent =
  | { type: "vault_captured"; count: number }
  | { type: "convoy_delivered"; totalCount: number }
  | { type: "execution_chain"; matchCount: number }
  | { type: "surge_activated" }
  | {
      type: "match_ended";
      won: boolean;
      durationSeconds: number;
      onMutator: boolean;
      eloRating: number;
    }
  | { type: "squad_objective_completed" }
  | { type: "jam_broken" }
  | { type: "vault_count"; simultaneous: number }
  | { type: "escort_streak"; consecutive: number }
  | { type: "match_played"; totalMatches: number };

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

const DEFINITIONS: AchievementDefinition[] = [
  {
    id: "first_vault",
    name: "First Blood",
    description: "Capture your first vault site",
  },
  {
    id: "ten_convoys",
    name: "Supply Chain",
    description: "Deliver 10 convoys successfully",
  },
  {
    id: "first_chain",
    name: "Chain Reaction",
    description: "Complete your first execution chain combo",
  },
  {
    id: "triple_chain",
    name: "Chain Master",
    description: "Complete 3 execution chain combos in a single match",
  },
  {
    id: "first_surge",
    name: "Comeback Kid",
    description: "Activate your first surge",
  },
  {
    id: "surge_win",
    name: "From the Ashes",
    description: "Win a match after activating surge",
  },
  {
    id: "five_vaults",
    name: "Vault Hoarder",
    description: "Control 5 vault sites simultaneously",
  },
  {
    id: "hundred_convoys",
    name: "Freight Commander",
    description: "Deliver 100 convoys across all matches",
  },
  {
    id: "jam_broken",
    name: "Frequency Jammer",
    description: "Successfully break a jam_breaker interception",
  },
  {
    id: "escort_streak",
    name: "Ironclad Escort",
    description: "Escort 5 consecutive convoys without loss",
  },
  {
    id: "squad_objective",
    name: "Team Player",
    description: "Complete a squad objective window",
  },
  {
    id: "mutator_win",
    name: "Rule Bender",
    description: "Win a match on any weekly mutator",
  },
  {
    id: "speed_run",
    name: "Blitz",
    description: "Win a match in under 10 minutes",
  },
  {
    id: "veteran",
    name: "Seasoned Commander",
    description: "Play 50 matches",
  },
  {
    id: "grandmaster",
    name: "Grandmaster",
    description: "Reach Elo rating 1900",
  },
];

const DEFINITION_MAP = new Map<string, AchievementDefinition>(
  DEFINITIONS.map((d) => [d.id, d]),
);

// ---------------------------------------------------------------------------
// Per-player mutable state (in-memory only)
// ---------------------------------------------------------------------------

interface PlayerState {
  unlocked: Map<string, number>; // achievementId → timestamp (ms)
  // Counters that accumulate across events before an unlock threshold is hit
  convoyCount: number;
  matchCount: number;
  surgeActivatedThisSession: boolean;
}

function makePlayerState(): PlayerState {
  return {
    unlocked: new Map(),
    convoyCount: 0,
    matchCount: 0,
    surgeActivatedThisSession: false,
  };
}

// Top-level stores
const playerStates = new Map<string, PlayerState>();

function getOrCreate(persistentId: string): PlayerState {
  let state = playerStates.get(persistentId);
  if (!state) {
    state = makePlayerState();
    playerStates.set(persistentId, state);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryUnlock(
  persistentId: string,
  state: PlayerState,
  achievementId: string,
  newlyUnlocked: AchievementDefinition[],
): void {
  if (state.unlocked.has(achievementId)) return;

  const def = DEFINITION_MAP.get(achievementId);
  if (!def) return;

  state.unlocked.set(achievementId, Date.now());
  newlyUnlocked.push(def);

  logger.info("Achievement unlocked", {
    persistentId,
    achievementId,
    achievementName: def.name,
  });
}

// ---------------------------------------------------------------------------
// Progress calculation (pure, no side effects)
// ---------------------------------------------------------------------------

function calcProgress(
  persistentId: string,
  state: PlayerState,
): AchievementProgress[] {
  return DEFINITIONS.map((def) => {
    const unlockedAt = state.unlocked.get(def.id) ?? null;

    if (unlockedAt !== null) {
      return {
        id: def.id,
        unlockedAt,
        progress: 100,
        progressLabel: "Unlocked",
      };
    }

    // Compute partial progress for trackable achievements
    switch (def.id) {
      case "ten_convoys": {
        const pct = Math.min(100, Math.floor((state.convoyCount / 10) * 100));
        return {
          id: def.id,
          unlockedAt: null,
          progress: pct,
          progressLabel: `${state.convoyCount} / 10 convoys`,
        };
      }
      case "hundred_convoys": {
        const pct = Math.min(100, Math.floor((state.convoyCount / 100) * 100));
        return {
          id: def.id,
          unlockedAt: null,
          progress: pct,
          progressLabel: `${state.convoyCount} / 100 convoys`,
        };
      }
      case "veteran": {
        const pct = Math.min(100, Math.floor((state.matchCount / 50) * 100));
        return {
          id: def.id,
          unlockedAt: null,
          progress: pct,
          progressLabel: `${state.matchCount} / 50 matches`,
        };
      }
      default:
        return {
          id: def.id,
          unlockedAt: null,
          progress: 0,
          progressLabel: "Not yet unlocked",
        };
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const achievementStore = {
  /**
   * Evaluate an event for the given player and return any newly unlocked
   * AchievementDefinition objects. Callers should forward these to
   * DiscordNotifier and/or the client toast queue.
   */
  checkAndUnlock(
    persistentId: string,
    event: AchievementEvent,
  ): AchievementDefinition[] {
    const state = getOrCreate(persistentId);
    const newlyUnlocked: AchievementDefinition[] = [];

    switch (event.type) {
      case "vault_captured": {
        if (event.count >= 1) {
          tryUnlock(persistentId, state, "first_vault", newlyUnlocked);
        }
        break;
      }

      case "vault_count": {
        if (event.simultaneous >= 5) {
          tryUnlock(persistentId, state, "five_vaults", newlyUnlocked);
        }
        break;
      }

      case "convoy_delivered": {
        // Use the authoritative total from the event (server-tracked)
        state.convoyCount = event.totalCount;
        if (state.convoyCount >= 10) {
          tryUnlock(persistentId, state, "ten_convoys", newlyUnlocked);
        }
        if (state.convoyCount >= 100) {
          tryUnlock(persistentId, state, "hundred_convoys", newlyUnlocked);
        }
        break;
      }

      case "execution_chain": {
        if (event.matchCount >= 1) {
          tryUnlock(persistentId, state, "first_chain", newlyUnlocked);
        }
        if (event.matchCount >= 3) {
          tryUnlock(persistentId, state, "triple_chain", newlyUnlocked);
        }
        break;
      }

      case "surge_activated": {
        state.surgeActivatedThisSession = true;
        tryUnlock(persistentId, state, "first_surge", newlyUnlocked);
        break;
      }

      case "jam_broken": {
        tryUnlock(persistentId, state, "jam_broken", newlyUnlocked);
        break;
      }

      case "escort_streak": {
        if (event.consecutive >= 5) {
          tryUnlock(persistentId, state, "escort_streak", newlyUnlocked);
        }
        break;
      }

      case "squad_objective_completed": {
        tryUnlock(persistentId, state, "squad_objective", newlyUnlocked);
        break;
      }

      case "match_played": {
        state.matchCount = event.totalMatches;
        if (state.matchCount >= 50) {
          tryUnlock(persistentId, state, "veteran", newlyUnlocked);
        }
        break;
      }

      case "match_ended": {
        if (event.won) {
          if (state.surgeActivatedThisSession) {
            tryUnlock(persistentId, state, "surge_win", newlyUnlocked);
          }
          if (event.onMutator) {
            tryUnlock(persistentId, state, "mutator_win", newlyUnlocked);
          }
          if (event.durationSeconds < 600) {
            tryUnlock(persistentId, state, "speed_run", newlyUnlocked);
          }
        }
        if (event.eloRating >= 1900) {
          tryUnlock(persistentId, state, "grandmaster", newlyUnlocked);
        }
        // Reset per-match surge flag after the match ends
        state.surgeActivatedThisSession = false;
        break;
      }
    }

    return newlyUnlocked;
  },

  /** Returns full progress snapshot for all achievements for a player. */
  getProgress(persistentId: string): AchievementProgress[] {
    const state = getOrCreate(persistentId);
    return calcProgress(persistentId, state);
  },

  /** Returns the set of unlocked achievement ids for a player. */
  getUnlocked(persistentId: string): string[] {
    const state = playerStates.get(persistentId);
    if (!state) return [];
    return Array.from(state.unlocked.keys());
  },

  /** Clears all state. Intended for test isolation only. */
  reset(): void {
    playerStates.clear();
  },
};
