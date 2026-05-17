/**
 * SpectatorAutoCamera — decaying heatmap auto-follow for spectator mode.
 *
 * Harvests VaultFrontActivity updates each tick, weights them by significance,
 * and pans the camera to the hottest zone every AUTO_PAN_INTERVAL_MS.
 * Toggle with 'A'.  Auto-enables when game.myPlayer() is null.
 */

import { EventBus } from "../../core/EventBus";
import {
  GameUpdateType,
  VaultFrontActivityUpdate,
} from "../../core/game/GameUpdates";
import { GameView } from "../../core/game/GameView";
import { GoToPositionEvent } from "./layers/Leaderboard";
import { TransformHandler } from "./TransformHandler";

const AUTO_PAN_INTERVAL_MS = 10_000;

const HEAT_WEIGHTS: Record<VaultFrontActivityUpdate["activity"], number> = {
  vault_captured: 100,
  convoy_intercepted: 80,
  comeback_surge: 70,
  convoy_delivered: 60,
  jam_breaker: 50,
  beacon_pulse: 30,
  convoy_rerouted: 20,
  convoy_escorted: 15,
  convoy_launched: 10,
  vault_passive_income: 5,
  ghost_reveal: 90,
};

const HEAT_DECAY_PER_SECOND = 0.85;

interface HeatPoint {
  x: number;
  y: number;
  heat: number;
  lastUpdatedMs: number;
}

export class SpectatorAutoCamera {
  private heatMap = new Map<string, HeatPoint>();
  private enabled: boolean;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: TransformHandler,
  ) {
    this.enabled = game.myPlayer() === null;
  }

  start(): void {
    this.intervalId = setInterval(() => this.maybePan(), AUTO_PAN_INTERVAL_MS);
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.code === "KeyA" && !this.isTextInput(e.target)) {
        e.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener("keydown", this.keydownHandler);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.keydownHandler !== null) {
      window.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  /** Call from GameRenderer.tick() each game tick to harvest activity updates. */
  tick(): void {
    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;
    const activityUpdates = updates[
      GameUpdateType.VaultFrontActivity
    ] as VaultFrontActivityUpdate[];
    for (const u of activityUpdates) {
      this.onActivity(u);
    }
  }

  toggle(): void {
    this.enabled = !this.enabled;
    if (this.enabled) this.maybePan();
  }

  private onActivity(update: VaultFrontActivityUpdate): void {
    const x = this.game.x(update.tile);
    const y = this.game.y(update.tile);
    const key = `${x},${y}`;
    const now = performance.now();
    const weight = HEAT_WEIGHTS[update.activity] ?? 10;

    const existing = this.heatMap.get(key);
    if (existing) {
      const elapsed = (now - existing.lastUpdatedMs) / 1000;
      existing.heat =
        existing.heat * Math.pow(HEAT_DECAY_PER_SECOND, elapsed) + weight;
      existing.lastUpdatedMs = now;
    } else {
      this.heatMap.set(key, { x, y, heat: weight, lastUpdatedMs: now });
    }
  }

  private maybePan(): void {
    if (!this.enabled) return;

    const now = performance.now();
    let best: HeatPoint | null = null;

    for (const [key, pt] of this.heatMap) {
      const elapsed = (now - pt.lastUpdatedMs) / 1000;
      pt.heat *= Math.pow(HEAT_DECAY_PER_SECOND, elapsed);
      pt.lastUpdatedMs = now;
      if (pt.heat < 1) {
        this.heatMap.delete(key);
        continue;
      }
      if (best === null || pt.heat > best.heat) best = pt;
    }

    if (best === null) return;
    this.eventBus.emit(new GoToPositionEvent(best.x, best.y));
  }

  private isTextInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
  }
}
