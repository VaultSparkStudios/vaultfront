import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  BountyBoardActivatedUpdate,
  GameUpdateType,
  LastStandActivatedUpdate,
  VaultFrontActivityUpdate,
  VaultFrontStatusUpdate,
} from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { fetchMicroHint } from "../../Api";
import type { Layer } from "./Layer";
import { uiStateManager } from "./UIStateManager";

const HINT_TRIGGER_TICKS = 1200; // 2 min before first idle hint
const HINT_MIN_INTERVAL_TICKS = 1800; // 3 min between any hints

// Per-trigger cooldowns (in ticks) — shorter because these are contextual
const TRIGGER_COOLDOWNS: Record<HintTrigger, number> = {
  idle: HINT_MIN_INTERVAL_TICKS,
  convoy_lost: 1800, // 3 min
  bounty_placed: 900, // 90s
  last_stand_nearby: 600, // 60s
  chain_broken: 900, // 90s
};

type HintTrigger =
  | "idle"
  | "convoy_lost"
  | "bounty_placed"
  | "last_stand_nearby"
  | "chain_broken";

@customElement("coach-hint-engine")
export class CoachHintEngine extends LitElement implements Layer {
  public game: GameView;

  @state() private hint: string | null = null;
  @state() private visible = false;

  private tickCount = 0;
  private hasIssuedVaultCommand = false;
  private latestStatus: VaultFrontStatusUpdate | null = null;
  private hintDismissTimer: ReturnType<typeof setTimeout> | null = null;
  /** Last tick each trigger fired — avoids per-trigger cooldown collisions */
  private lastHintTickByTrigger = new Map<HintTrigger, number>();
  /** True while an async fetch is in flight — prevents concurrent calls */
  private fetching = false;

  createRenderRoot() {
    return this;
  }

  tick(): void {
    if (!this.game) return;
    this.tickCount++;

    if (localStorage.getItem("coachHintsDisabled") === "true") return;

    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;

    // Track latest vault-site state
    const statusUpdates = updates[GameUpdateType.VaultFrontStatus] as
      | VaultFrontStatusUpdate[]
      | undefined;
    if (statusUpdates && statusUpdates.length > 0) {
      this.latestStatus = statusUpdates[statusUpdates.length - 1];
    }

    // Track whether player has issued vault commands (idle hint guard)
    const activityUpdates = updates[
      GameUpdateType.VaultFrontActivity
    ] as VaultFrontActivityUpdate[];
    if (
      activityUpdates?.some((a) =>
        [
          "convoy_launched",
          "convoy_rerouted",
          "convoy_escorted",
          "jam_breaker",
          "ghost_reveal",
        ].includes(a.activity),
      )
    ) {
      this.hasIssuedVaultCommand = true;
    }

    // Evaluate event triggers (ordered by priority)
    const trigger = this.detectTrigger(updates);
    if (trigger && !this.fetching) {
      void this.fetchAndShow(trigger);
    }
  }

  private detectTrigger(
    updates: ReturnType<GameView["updatesSinceLastTick"]>,
  ): HintTrigger | null {
    const mySmallId = this.game.myPlayer()?.smallID();

    // convoy_lost: one of my convoys was intercepted
    const activities = updates?.[GameUpdateType.VaultFrontActivity] as
      | VaultFrontActivityUpdate[]
      | undefined;
    if (
      mySmallId !== undefined &&
      activities?.some(
        (a) =>
          a.activity === "convoy_intercepted" && a.targetPlayerID === mySmallId,
      ) &&
      this.canTrigger("convoy_lost")
    ) {
      return "convoy_lost";
    }

    // bounty_placed: a bounty was placed on me
    const bountyUpdates = updates?.[GameUpdateType.BountyBoardActivated] as
      | BountyBoardActivatedUpdate[]
      | undefined;
    if (
      mySmallId !== undefined &&
      bountyUpdates?.some((b) => b.targetPlayerID === mySmallId) &&
      this.canTrigger("bounty_placed")
    ) {
      return "bounty_placed";
    }

    // last_stand_nearby: last-stand activated near my sites
    const lastStandUpdates = updates?.[GameUpdateType.LastStandActivated] as
      | LastStandActivatedUpdate[]
      | undefined;
    if (
      lastStandUpdates &&
      lastStandUpdates.length > 0 &&
      this.canTrigger("last_stand_nearby")
    ) {
      return "last_stand_nearby";
    }

    // chain_broken: comeback_surge ending can indicate chain pressure reset
    if (
      activities?.some((a) => a.activity === "comeback_surge") &&
      this.canTrigger("chain_broken")
    ) {
      return "chain_broken";
    }

    // idle: 2 min elapsed, player hasn't issued a vault command
    if (
      this.tickCount >= HINT_TRIGGER_TICKS &&
      !this.hasIssuedVaultCommand &&
      this.canTrigger("idle")
    ) {
      return "idle";
    }

    return null;
  }

  private canTrigger(trigger: HintTrigger): boolean {
    const lastTick = this.lastHintTickByTrigger.get(trigger) ?? -Infinity;
    return this.tickCount - lastTick >= TRIGGER_COOLDOWNS[trigger];
  }

  private localVaultSiteCount(): number {
    const myPlayerId = this.game.myPlayer()?.smallID();
    if (myPlayerId === undefined || !this.latestStatus) return 0;
    return this.latestStatus.sites.filter(
      (site) =>
        site.controllerID === myPlayerId || site.passiveOwnerID === myPlayerId,
    ).length;
  }

  private async fetchAndShow(trigger: HintTrigger): Promise<void> {
    this.fetching = true;
    this.lastHintTickByTrigger.set(trigger, this.tickCount);
    const state = uiStateManager.get();
    const sites = this.localVaultSiteCount();
    const hint = await fetchMicroHint({
      gold: Number(state.playerGold),
      sites,
      trigger,
    });
    this.fetching = false;
    if (!hint) return;
    this.hint = hint;
    this.visible = true;

    if (this.hintDismissTimer) clearTimeout(this.hintDismissTimer);
    this.hintDismissTimer = setTimeout(() => {
      this.visible = false;
      this.hint = null;
    }, 12_000);
  }

  private dismiss(): void {
    this.visible = false;
    this.hint = null;
    if (this.hintDismissTimer) clearTimeout(this.hintDismissTimer);
  }

  private disableHints(): void {
    localStorage.setItem("coachHintsDisabled", "true");
    this.dismiss();
  }

  render() {
    if (!this.visible || !this.hint) return html``;
    return html`
      <style>
        .coach-hint {
          position: fixed;
          bottom: 80px;
          right: 16px;
          z-index: 850;
          max-width: 260px;
          background: rgba(15, 23, 42, 0.88);
          border: 1px solid rgba(59, 130, 246, 0.4);
          border-radius: 8px;
          padding: 8px 12px;
          backdrop-filter: blur(6px);
          animation: hint-slide-in 0.3s ease-out;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .coach-hint-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .coach-hint-label {
          font-size: 0.6rem;
          color: #60a5fa;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }
        .coach-hint-controls {
          display: flex;
          gap: 4px;
        }
        .coach-hint-btn {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 0.65rem;
          padding: 1px 4px;
          border-radius: 3px;
          line-height: 1;
        }
        .coach-hint-btn:hover {
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.06);
        }
        .coach-hint-text {
          font-size: 0.72rem;
          color: #e2e8f0;
          line-height: 1.4;
        }
        @keyframes hint-slide-in {
          from {
            opacity: 0;
            transform: translateX(12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      </style>
      <div class="coach-hint">
        <div class="coach-hint-header">
          <span class="coach-hint-label">💡 Coach</span>
          <div class="coach-hint-controls">
            <button
              class="coach-hint-btn"
              @click=${this.disableHints}
              title="Turn off hints"
            >
              off
            </button>
            <button class="coach-hint-btn" @click=${this.dismiss}>✕</button>
          </div>
        </div>
        <div class="coach-hint-text">${this.hint}</div>
      </div>
    `;
  }
}
