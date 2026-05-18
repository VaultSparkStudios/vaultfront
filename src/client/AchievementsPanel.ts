/**
 * AchievementsPanel — displays all achievements with progress bars and meta-chains.
 *
 * Usage: mount as a tab in AccountModal.
 * Call `loadForPlayer(persistentId)` to populate.
 */

import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  fetchAchievements,
  type AchievementProgress,
  type MetaChainProgress,
} from "./Api";

@customElement("achievements-panel")
export class AchievementsPanel extends LitElement {
  @state() private achievements: AchievementProgress[] = [];
  @state() private metaChains: MetaChainProgress[] = [];
  @state() private loading = false;
  @state() private persistentId = "";

  static styles = css`
    :host {
      display: block;
      font-family: "Overpass", sans-serif;
      color: #f1f5f9;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .count-chip {
      background: rgba(96, 165, 250, 0.15);
      border: 1px solid rgba(96, 165, 250, 0.3);
      border-radius: 20px;
      padding: 3px 12px;
      font-size: 0.8rem;
      color: #93c5fd;
    }
    .section-title {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #64748b;
      margin: 20px 0 12px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 10px;
    }
    .card {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(71, 85, 105, 0.4);
      border-radius: 8px;
      padding: 14px;
      transition: border-color 0.2s;
    }
    .card.unlocked {
      border-color: rgba(255, 196, 0, 0.4);
      background: rgba(20, 16, 0, 0.8);
    }
    .card.meta {
      border-color: rgba(168, 85, 247, 0.5);
      background: rgba(20, 10, 30, 0.9);
    }
    .card-name {
      font-size: 0.95rem;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 4px;
    }
    .card.unlocked .card-name {
      color: #fbbf24;
    }
    .card.meta .card-name {
      color: #d8b4fe;
    }
    .card-desc {
      font-size: 0.78rem;
      color: #94a3b8;
      line-height: 1.4;
      margin-bottom: 10px;
    }
    .progress-bar-wrap {
      height: 4px;
      background: rgba(71, 85, 105, 0.4);
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: rgba(96, 165, 250, 0.7);
      transition: width 0.5s ease;
    }
    .card.unlocked .progress-bar-fill {
      background: rgba(251, 191, 36, 0.8);
    }
    .card.meta .progress-bar-fill {
      background: rgba(168, 85, 247, 0.8);
    }
    .progress-label {
      font-size: 0.7rem;
      color: #64748b;
      margin-top: 4px;
    }
    .card.unlocked .progress-label {
      color: #92400e;
    }
    .unlock-date {
      font-size: 0.7rem;
      color: #78716c;
      margin-top: 4px;
    }
    .meta-req {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .meta-req-chip {
      font-size: 0.65rem;
      padding: 2px 7px;
      border-radius: 10px;
      background: rgba(71, 85, 105, 0.3);
      color: #94a3b8;
    }
    .meta-req-chip.done {
      background: rgba(52, 211, 153, 0.15);
      color: #6ee7b7;
    }
    .empty {
      color: #64748b;
      text-align: center;
      padding: 40px;
      font-size: 0.9rem;
    }
  `;

  async loadForPlayer(persistentId: string): Promise<void> {
    this.persistentId = persistentId;
    this.loading = true;
    const data = await fetchAchievements(persistentId);
    if (data) {
      this.achievements = data.achievements;
      this.metaChains = data.metaChains;
    }
    this.loading = false;
  }

  private formatDate(ts: number | null): string {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  render() {
    if (this.loading) {
      return html`<div class="empty">Loading achievements…</div>`;
    }
    if (!this.persistentId) {
      return html`<div class="empty">Sign in to view achievements.</div>`;
    }

    const unlockedCount = this.achievements.filter(
      (a) => a.unlockedAt !== null,
    ).length;
    const totalCount = this.achievements.length;
    const metaUnlocked = this.metaChains.filter((c) => c.unlocked).length;

    return html`
      <div class="header">
        <span style="font-size:1rem;font-weight:700;">Achievements</span>
        <span class="count-chip"
          >${unlockedCount} / ${totalCount} unlocked</span
        >
        ${metaUnlocked > 0
          ? html`<span
              class="count-chip"
              style="border-color:rgba(168,85,247,.4);color:#d8b4fe;"
              >${metaUnlocked} meta</span
            >`
          : ""}
      </div>

      <div class="section-title">Base Achievements</div>
      <div class="grid">
        ${this.achievements.map(
          (a) => html`
            <div class="card ${a.unlockedAt !== null ? "unlocked" : ""}">
              <div class="card-name">
                ${a.unlockedAt !== null ? "✓ " : ""}${a.id
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
              <div class="card-desc">
                ${a.progressLabel !== "Not yet unlocked" &&
                a.unlockedAt === null
                  ? a.progressLabel
                  : ""}
              </div>
              <div class="progress-bar-wrap">
                <div
                  class="progress-bar-fill"
                  style="width:${a.progress}%"
                ></div>
              </div>
              ${a.unlockedAt !== null
                ? html`<div class="unlock-date">
                    Unlocked ${this.formatDate(a.unlockedAt)}
                  </div>`
                : html`<div class="progress-label">${a.progress}%</div>`}
            </div>
          `,
        )}
      </div>

      <div class="section-title">Prestige Chains</div>
      <div class="grid">
        ${this.metaChains.map(
          (c) => html`
            <div class="card meta ${c.unlocked ? "unlocked" : ""}">
              <div class="card-name">${c.unlocked ? "✦ " : "○ "}${c.name}</div>
              <div class="card-desc">${c.description}</div>
              <div class="progress-bar-wrap">
                <div
                  class="progress-bar-fill"
                  style="width:${Math.round(
                    (c.completedRequires.length / c.requires.length) * 100,
                  )}%"
                ></div>
              </div>
              <div class="meta-req">
                ${c.requires.map(
                  (r) => html`
                    <span
                      class="meta-req-chip ${c.completedRequires.includes(r)
                        ? "done"
                        : ""}"
                      >${r.replace(/_/g, " ")}</span
                    >
                  `,
                )}
              </div>
              ${c.unlocked
                ? html`<div class="unlock-date">Reward: ${c.reward.title}</div>`
                : ""}
            </div>
          `,
        )}
      </div>
    `;
  }
}

if (!customElements.get("achievements-panel")) {
  customElements.define("achievements-panel", AchievementsPanel);
}
