/**
 * NarratorReporter — forwards significant VaultFrontActivity events to the
 * server-side NarratorBus so spectators receive live AI commentary.
 */

import {
  GameUpdateType,
  VaultFrontActivityUpdate,
} from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { pushNarratorEvent } from "../../Api";
import { Layer } from "./Layer";

type ActivityType = VaultFrontActivityUpdate["activity"];

const HIGH_SIGNAL: Set<ActivityType> = new Set<ActivityType>([
  "vault_captured",
  "convoy_intercepted",
  "heist_executed",
  "bounty_collected",
  "comeback_surge",
  "ghost_reveal",
  "jam_breaker",
]);

export class NarratorReporter implements Layer {
  public game: GameView;
  private gameId: string | null = null;
  private lastPushMs = 0;
  private readonly MIN_PUSH_INTERVAL = 3_000;

  setGameId(gameId: string): void {
    this.gameId = gameId;
  }

  tick(): void {
    if (!this.gameId) return;
    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;

    const activities = updates[GameUpdateType.VaultFrontActivity] as
      VaultFrontActivityUpdate[] | undefined;
    if (!activities?.length) return;

    const now = Date.now();
    if (now - this.lastPushMs < this.MIN_PUSH_INTERVAL) return;

    for (const act of activities) {
      if (!HIGH_SIGNAL.has(act.activity)) continue;
      this.lastPushMs = now;
      pushNarratorEvent(this.gameId, act.activity, act.label || undefined);
      break;
    }
  }
}
