import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  GameUpdateType,
  VaultFrontActivityUpdate,
} from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import {
  ActivityCounts,
  classifyPlayStyle,
  countsFromActivities,
  emptyActivityCounts,
  PlayStyleLabel,
} from "../PlayStyleClassifier";
import type { Layer } from "./Layer";

const CHIP_FIRST_TICK = 60; // show after 60 ticks of activity
const CHIP_REFRESH_TICKS = 120; // re-classify every 120 ticks

@customElement("play-style-chip")
export class PlayStyleChip extends LitElement implements Layer {
  public game: GameView;

  @state() private label: PlayStyleLabel | null = null;
  @state() private dominant = 0;

  private tickCount = 0;
  private lastClassifyTick = 0;
  private counts: ActivityCounts = emptyActivityCounts();

  createRenderRoot() {
    return this;
  }

  tick(): void {
    if (!this.game) return;
    this.tickCount++;

    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;

    const activities = updates[
      GameUpdateType.VaultFrontActivity
    ] as VaultFrontActivityUpdate[];

    if (activities && activities.length > 0) {
      this.counts = countsFromActivities(activities, this.counts);
    }

    if (
      this.tickCount >= CHIP_FIRST_TICK &&
      this.tickCount - this.lastClassifyTick >= CHIP_REFRESH_TICKS
    ) {
      this.lastClassifyTick = this.tickCount;
      const result = classifyPlayStyle(this.counts);
      this.label = result.label;
      this.dominant = result.dominant;
    }
  }

  render() {
    if (!this.label) return html``;

    const LABEL_COLORS: Record<PlayStyleLabel, string> = {
      "Iron Fist": "#f43f5e",
      "Convoy Lord": "#10b981",
      "Shadow Broker": "#a855f7",
      Fortress: "#38bdf8",
      Balanced: "#94a3b8",
    };
    const color = LABEL_COLORS[this.label];

    return html`
      <style>
        .play-style-chip {
          position: fixed;
          top: 52px;
          right: 16px;
          z-index: 820;
          display: flex;
          align-items: center;
          gap: 5px;
          background: rgba(15, 23, 42, 0.82);
          border: 1px solid ${color}55;
          border-radius: 20px;
          padding: 3px 10px 3px 6px;
          backdrop-filter: blur(4px);
          font-size: 0.62rem;
          color: #e2e8f0;
          letter-spacing: 0.04em;
          user-select: none;
          animation: chip-fade-in 0.4s ease-out;
        }
        .play-style-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: ${color};
          flex-shrink: 0;
        }
        .play-style-label {
          font-weight: 600;
          color: ${color};
        }
        .play-style-prefix {
          color: #64748b;
          margin-right: 2px;
        }
        @keyframes chip-fade-in {
          from {
            opacity: 0;
            transform: translateX(8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      </style>
      <div
        class="play-style-chip"
        title="Your emerging play style (updates every 12s)"
      >
        <span class="play-style-dot"></span>
        <span class="play-style-prefix">Emerging:</span>
        <span class="play-style-label">${this.label}</span>
      </div>
    `;
  }
}
