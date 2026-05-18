import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  GameUpdateType,
  VaultFrontStatusUpdate,
} from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { fetchMicroHint } from "../../Api";
import type { Layer } from "./Layer";
import { uiStateManager } from "./UIStateManager";

const HINT_TRIGGER_TICKS = 1200; // 2 min
const HINT_MIN_INTERVAL_TICKS = 1800; // 3 min between hints
const HINT_DISMISS_MS = 12000;

@customElement("coach-hint-engine")
export class CoachHintEngine extends LitElement implements Layer {
  public game: GameView;

  @state() private hint: string | null = null;
  @state() private visible = false;

  private tickCount = 0;
  private lastHintTick = -HINT_MIN_INTERVAL_TICKS;
  private hintDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private hasIssuedVaultCommand = false;
  private hasFetched = false;
  private latestStatus: VaultFrontStatusUpdate | null = null;

  createRenderRoot() {
    return this;
  }

  tick(): void {
    if (!this.game) return;
    this.tickCount++;

    // Check if user has opted in (stored in user settings / localStorage)
    if (localStorage.getItem("coachHintsDisabled") === "true") return;

    const updates = this.game.updatesSinceLastTick();
    const statusUpdates = updates?.[GameUpdateType.VaultFrontStatus] as
      | VaultFrontStatusUpdate[]
      | undefined;
    if (statusUpdates && statusUpdates.length > 0) {
      this.latestStatus = statusUpdates[statusUpdates.length - 1];
    }

    const activityUpdates = updates?.[GameUpdateType.VaultFrontActivity];
    if (
      activityUpdates?.some((activity) =>
        [
          "convoy_launched",
          "convoy_rerouted",
          "convoy_escorted",
          "jam_breaker",
          "ghost_reveal",
        ].includes(activity.activity),
      )
    ) {
      this.hasIssuedVaultCommand = true;
    }

    if (
      this.tickCount >= HINT_TRIGGER_TICKS &&
      !this.hasIssuedVaultCommand &&
      !this.hasFetched &&
      this.tickCount - this.lastHintTick >= HINT_MIN_INTERVAL_TICKS
    ) {
      this.hasFetched = true;
      const state = uiStateManager.get();
      const sites = this.localVaultSiteCount();
      void this.fetchAndShow(Number(state.playerGold), sites);
    }
  }

  private localVaultSiteCount(): number {
    const myPlayerId = this.game.myPlayer()?.smallID();
    if (myPlayerId === undefined || !this.latestStatus) return 0;
    return this.latestStatus.sites.filter(
      (site) =>
        site.controllerID === myPlayerId || site.passiveOwnerID === myPlayerId,
    ).length;
  }

  private async fetchAndShow(gold: number, sites: number): Promise<void> {
    const hint = await fetchMicroHint({ gold, sites });
    if (!hint) return;
    this.hint = hint;
    this.visible = true;
    this.lastHintTick = this.tickCount;

    if (this.hintDismissTimer) clearTimeout(this.hintDismissTimer);
    this.hintDismissTimer = setTimeout(() => {
      this.visible = false;
      this.hint = null;
    }, HINT_DISMISS_MS);
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
