/**
 * PlayStyleCareerArc — cross-session play-style evolution timeline.
 *
 * Shows the last 20 matches' style classifications as a horizontal
 * timeline with trend chip. Category-first insight layer.
 */

import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { fetchStyleHistory, type PlayStyle, type StyleEntry } from "./Api";

const STYLE_COLORS: Record<PlayStyle, string> = {
  "Iron Fist": "#ef4444",
  "Convoy Lord": "#3b82f6",
  "Shadow Broker": "#8b5cf6",
  Balanced: "#22c55e",
};

const STYLE_ICONS: Record<PlayStyle, string> = {
  "Iron Fist": "⚔️",
  "Convoy Lord": "🚛",
  "Shadow Broker": "🌑",
  Balanced: "⚖️",
};

@customElement("play-style-career-arc")
export class PlayStyleCareerArc extends LitElement {
  @state() private history: StyleEntry[] = [];
  @state() private trend: { style: PlayStyle; count: number } | null = null;
  @state() private loading = false;

  static styles = css`
    :host {
      display: block;
      font-family: "Overpass", sans-serif;
    }
    .arc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .arc-title {
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .trend-chip {
      font-size: 0.78rem;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 12px;
      background: rgba(71, 85, 105, 0.3);
      color: #94a3b8;
    }
    .timeline {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: nowrap;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .timeline-node {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .node-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      border: 2px solid transparent;
    }
    .node-dot.latest {
      border-color: white;
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
    }
    .node-date {
      font-size: 0.6rem;
      color: #475569;
    }
    .connector {
      width: 12px;
      height: 2px;
      background: rgba(71, 85, 105, 0.4);
      flex-shrink: 0;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .empty {
      color: #64748b;
      font-size: 0.85rem;
      padding: 16px 0;
    }
  `;

  async loadForPlayer(persistentId: string): Promise<void> {
    this.loading = true;
    const data = await fetchStyleHistory(persistentId);
    if (data) {
      this.history = data.history;
      this.trend = data.trend;
    }
    this.loading = false;
  }

  private formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  render() {
    if (this.loading) return html`<div class="empty">Loading career arc…</div>`;
    if (this.history.length === 0)
      return html`<div class="empty">
        Play matches to build your career arc.
      </div>`;

    const last20 = this.history.slice(-20);

    return html`
      <div class="arc-header">
        <span class="arc-title"
          >Career Arc — Last ${last20.length} Matches</span
        >
        ${
          this.trend
            ? html`<span
                class="trend-chip"
                style="color:${
                  STYLE_COLORS[this.trend.style]
                };background:${STYLE_COLORS[this.trend.style]}22"
              >
                Trending: ${STYLE_ICONS[this.trend.style]} ${this.trend.style} ▲
              </span>`
            : ""
        }
      </div>
      <div class="timeline">
        ${last20.map(
          (entry, i) => html`
            ${i > 0 ? html`<div class="connector"></div>` : ""}
            <div class="timeline-node">
              <div
                class="node-dot ${i === last20.length - 1 ? "latest" : ""}"
                style="background:${
                  STYLE_COLORS[entry.style]
                }33;color:${STYLE_COLORS[entry.style]}"
                title="${entry.style} — ${this.formatDate(entry.timestamp)}"
              >
                ${STYLE_ICONS[entry.style]}
              </div>
              ${
                i === 0 || i === last20.length - 1
                  ? html`<div class="node-date">
                      ${this.formatDate(entry.timestamp)}
                    </div>`
                  : ""
              }
            </div>
          `,
        )}
      </div>
      <div class="legend">
        ${(Object.entries(STYLE_COLORS) as [PlayStyle, string][]).map(
          ([style, color]) => html`
            <div class="legend-item">
              <div class="legend-dot" style="background:${color}"></div>
              ${STYLE_ICONS[style]} ${style}
            </div>
          `,
        )}
      </div>
    `;
  }
}

if (!customElements.get("play-style-career-arc")) {
  customElements.define("play-style-career-arc", PlayStyleCareerArc);
}
