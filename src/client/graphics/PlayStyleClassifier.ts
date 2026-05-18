/**
 * PlayStyleClassifier — derives player play-style label from live activity events.
 *
 * Used by both VaultFrontLayer (mid-match indicator) and WinModal (post-game card).
 * The mid-match version tracks raw activity event counts; the post-game version
 * receives structured stats from the server. Both produce the same label + bars shape.
 */

export type PlayStyleLabel =
  | "Iron Fist"
  | "Convoy Lord"
  | "Shadow Broker"
  | "Fortress"
  | "Balanced";

export interface PlayStyleBar {
  label: string;
  pct: number;
  color: string;
}

export interface PlayStyleResult {
  label: PlayStyleLabel;
  bars: PlayStyleBar[];
  dominant: number; // 0-100, how confident the classification is
}

export interface ActivityCounts {
  vaultCaptures: number;
  conquests: number;
  convoysDelivered: number;
  passivePayouts: number;
  cleanExecutionStreaks: number;
  betrayals: number;
  jamBreakerUses: number;
  convoyEscortCommands: number;
  defenseFactoryTicks: number;
}

export function classifyPlayStyle(counts: ActivityCounts): PlayStyleResult {
  const aggression = counts.vaultCaptures + counts.conquests;
  const economy = counts.convoysDelivered + counts.passivePayouts;
  const deception =
    counts.cleanExecutionStreaks + counts.betrayals + counts.jamBreakerUses;
  const resilience =
    Math.round(counts.defenseFactoryTicks / 600) + counts.convoyEscortCommands;

  const total = Math.max(1, aggression + economy + deception + resilience);
  const a = aggression / total;
  const e = economy / total;
  const d = deception / total;
  const r = resilience / total;

  const label: PlayStyleLabel =
    a >= 0.4
      ? "Iron Fist"
      : e >= 0.4
        ? "Convoy Lord"
        : d >= 0.35
          ? "Shadow Broker"
          : r >= 0.35
            ? "Fortress"
            : "Balanced";

  const dominant = Math.round(Math.max(a, e, d, r) * 100);

  return {
    label,
    dominant,
    bars: [
      { label: "Aggression", pct: Math.round(a * 100), color: "bg-rose-500" },
      { label: "Economy", pct: Math.round(e * 100), color: "bg-emerald-500" },
      { label: "Deception", pct: Math.round(d * 100), color: "bg-purple-500" },
      { label: "Resilience", pct: Math.round(r * 100), color: "bg-sky-500" },
    ],
  };
}

/** Build an ActivityCounts snapshot from live VaultFrontActivity events. */
export function countsFromActivities(
  activities: Array<{ activity: string }>,
  existing: ActivityCounts = emptyActivityCounts(),
): ActivityCounts {
  const counts = { ...existing };
  for (const { activity } of activities) {
    switch (activity) {
      case "vault_captured":
        counts.vaultCaptures++;
        break;
      case "convoy_delivered":
        counts.convoysDelivered++;
        break;
      case "passive_payout":
        counts.passivePayouts++;
        break;
      case "clean_execution_streak":
        counts.cleanExecutionStreaks++;
        break;
      case "jam_breaker":
        counts.jamBreakerUses++;
        break;
      case "convoy_escorted":
        counts.convoyEscortCommands++;
        break;
    }
  }
  return counts;
}

export function emptyActivityCounts(): ActivityCounts {
  return {
    vaultCaptures: 0,
    conquests: 0,
    convoysDelivered: 0,
    passivePayouts: 0,
    cleanExecutionStreaks: 0,
    betrayals: 0,
    jamBreakerUses: 0,
    convoyEscortCommands: 0,
    defenseFactoryTicks: 0,
  };
}
