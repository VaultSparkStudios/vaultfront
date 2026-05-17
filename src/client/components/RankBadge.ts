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

  createRenderRoot() {
    return this;
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

    return html`
      <span
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${colors.bg} ${colors.text} ${colors.border}"
        title="${this.label} — ${this.elo} Elo"
      >
        ${icon} ${this.compact ? this.label : `${this.label} · ${this.elo}`}
      </span>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "rank-badge": RankBadge;
  }
}
