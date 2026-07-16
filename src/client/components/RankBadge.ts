import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { EloLabel } from "../../server/EloRating";

// Tier colour map for badge styling
const TIER_COLORS: Record<
  EloLabel,
  { bg: string; text: string; border: string }
> = {
  Bronze: {
    bg: "bg-amber-900/50",
    text: "text-amber-200",
    border: "border-amber-700/60",
  },
  Silver: {
    bg: "bg-slate-600/50",
    text: "text-slate-200",
    border: "border-slate-400/60",
  },
  Gold: {
    bg: "bg-yellow-700/50",
    text: "text-yellow-200",
    border: "border-yellow-500/60",
  },
  Platinum: {
    bg: "bg-cyan-800/50",
    text: "text-cyan-200",
    border: "border-cyan-500/60",
  },
  Diamond: {
    bg: "bg-blue-800/50",
    text: "text-blue-200",
    border: "border-blue-400/60",
  },
  Grandmaster: {
    bg: "bg-purple-900/50",
    text: "text-purple-200",
    border: "border-purple-400/70",
  },
};

const TIER_ICONS: Record<EloLabel, string> = {
  Bronze: "🥉",
  Silver: "🥈",
  Gold: "🥇",
  Platinum: "💠",
  Diamond: "💎",
  Grandmaster: "👑",
};

/**
 * <rank-badge elo="1450" label="Platinum" matches-played="12"></rank-badge>
 *
 * Displays a compact rank tier badge. Shows placement progress when
 * matchesPlayed < 5, otherwise shows the tier + Elo number.
 */
@customElement("rank-badge")
export class RankBadge extends LitElement {
  @property({ type: Number }) elo = 1200;
  @property({ type: String }) label: EloLabel = "Silver";
  @property({ type: Number, attribute: "matches-played" }) matchesPlayed = 0;
  @property({ type: Boolean, attribute: "compact" }) compact = false;
  @property({ type: String, attribute: "dynasty-emblem" }) dynastyEmblem = "";
  @property({ type: String, attribute: "dynasty-tier" }) dynastyTier = "none";
  @property({ type: Boolean, attribute: "decaying" }) decaying = false;
  @property({ type: Array, attribute: "elo-history" }) eloHistory: number[] =
    [];

  createRenderRoot() {
    return this;
  }

  private renderSparkline() {
    const pts = this.eloHistory;
    if (pts.length < 2) return null;
    const W = 60;
    const H = 18;
    const minV = Math.min(...pts);
    const maxV = Math.max(...pts);
    const range = maxV - minV || 1;
    const xStep = W / (pts.length - 1);
    const coords = pts.map(
      (v, i) =>
        `${(i * xStep).toFixed(1)},${(H - ((v - minV) / range) * H).toFixed(1)}`,
    );
    const rising = pts[pts.length - 1] >= pts[0];
    const stroke = rising ? "#4ade80" : "#f87171";
    const label = rising ? "Climbing ▲" : "Dropping ▼";
    const labelColor = rising ? "text-emerald-400" : "text-rose-400";
    return html`
      <span class="hidden group-hover:inline-flex items-center gap-1 ml-1">
        <svg
          width="${W}"
          height="${H}"
          viewBox="0 0 ${W} ${H}"
          class="overflow-visible"
        >
          <polyline
            points="${coords.join(" ")}"
            fill="none"
            stroke="${stroke}"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
        </svg>
        <span class="text-[10px] ${labelColor}">${label}</span>
      </span>
    `;
  }

  private get placementComplete() {
    return this.matchesPlayed >= 5;
  }

  render() {
    const colors = TIER_COLORS[this.label] ?? TIER_COLORS.Silver;
    const icon = TIER_ICONS[this.label] ?? "🎮";

    if (!this.placementComplete) {
      return html`
        <span
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold bg-slate-700/60 text-slate-300 border-slate-500/50"
          title="Complete placement matches to earn your rank"
        >
          🎮 Placement ${this.matchesPlayed}/5
        </span>
      `;
    }

    const hasDynasty = this.dynastyTier !== "none" && this.dynastyEmblem !== "";
    const decayClass = this.decaying
      ? "outline outline-2 outline-orange-400 animate-pulse"
      : "";
    const decayTitle = this.decaying ? " · Rank Decaying — play to stop" : "";

    return html`
      <span class="inline-flex items-center gap-1 group">
        ${
          hasDynasty
            ? html`<span
                class="text-xs"
                title="Dynasty ${this.dynastyTier} — ${this.dynastyEmblem}"
                >${this.dynastyEmblem}</span
              >`
            : ""
        }
        <span
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${colors.bg} ${colors.text} ${colors.border} ${decayClass}"
          title="${this.label} — ${this.elo} Elo${
            hasDynasty ? ` · Dynasty ${this.dynastyTier}` : ""
          }${decayTitle}"
        >
          ${icon} ${this.compact ? this.label : `${this.label} · ${this.elo}`}
          ${
            this.decaying
              ? html`<span class="text-orange-300 text-[10px]">↓</span>`
              : ""
          }
        </span>
        ${this.renderSparkline()}
      </span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "rank-badge": RankBadge;
  }
}
