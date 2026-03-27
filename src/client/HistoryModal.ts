// VaultFront — <history-modal> web component
// Shows per-player match history, stats, and the global leaderboard.

import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

// ── API types (mirrored from server) ──────────────────────────────────────────

interface MatchHistoryEntry {
  id: number;
  persistentId: string;
  gameId: string;
  won: boolean;
  durationSeconds: number;
  vaultCaptures: number;
  convoyDeliveries: number;
  executionChains: number;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  mapName: string;
  playerCount: number;
  createdAt: string;
}

interface PlayerStats {
  persistentId: string;
  displayName: string;
  eloRating: number;
  eloLabel: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  vaultCaptures: number;
  convoyDeliveries: number;
  executionChains: number;
  surgeActivations: number;
  createdAt: string;
  updatedAt: string;
}

interface LeaderboardEntry {
  persistentId: string;
  displayName: string;
  eloRating: number;
  rank: number;
  matchesPlayed: number;
  wins: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

@customElement("history-modal")
export class HistoryModal extends LitElement {
  /** The player's persistentId to load data for. Set before calling open(). */
  @property({ type: String }) persistentId = "";

  @state() private activeTab: "history" | "leaderboard" = "history";
  @state() private stats: PlayerStats | null = null;
  @state() private history: MatchHistoryEntry[] = [];
  @state() private leaderboard: LeaderboardEntry[] = [];
  @state() private open = false;
  @state() private loadingHistory = false;
  @state() private loadingLeaderboard = false;
  @state() private errorHistory: string | null = null;
  @state() private errorLeaderboard: string | null = null;

  static styles = css`
    :host {
      --bg: var(--vaultMidnight, #0a1822);
      --panel: var(--vaultSlate, #122736);
      --gold: var(--vaultAmber, #fbbf24);
      --blue: var(--vaultCyan, #22d3ee);
      --orange: #f97316;
      --text: #f3f4f6;
      --muted: #9ca3af;
      font-family: inherit;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal {
      background: var(--bg);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      width: min(780px, 95vw);
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: var(--panel);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .header-info {
      flex: 1;
      min-width: 0;
    }

    .player-name {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .elo-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 0.8rem;
      color: var(--gold);
      font-weight: 600;
    }

    .elo-number {
      color: var(--blue);
    }

    .stat-chips {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    .stat-chip {
      font-size: 0.75rem;
      color: var(--muted);
    }

    .stat-chip span {
      color: var(--text);
      font-weight: 600;
    }

    .close-btn {
      background: transparent;
      border: none;
      color: var(--muted);
      font-size: 1.4rem;
      line-height: 1;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition:
        color 0.15s,
        background 0.15s;
    }

    .close-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.07);
    }

    /* Tabs */
    .tabs {
      display: flex;
      background: var(--panel);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .tab {
      flex: 1;
      padding: 10px 0;
      background: transparent;
      border: none;
      color: var(--muted);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition:
        color 0.15s,
        border-color 0.15s;
      text-align: center;
    }

    .tab.active {
      color: var(--blue);
      border-bottom-color: var(--blue);
    }

    .tab:hover:not(.active) {
      color: var(--text);
    }

    /* Body */
    .body {
      overflow-y: auto;
      flex: 1;
      padding: 16px 20px;
    }

    /* Match history table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }

    thead th {
      text-align: left;
      color: var(--muted);
      font-weight: 600;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    tbody tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      transition: background 0.1s;
    }

    tbody tr:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    td {
      padding: 8px 8px;
      color: var(--text);
      vertical-align: middle;
    }

    .result-win {
      color: var(--blue);
      font-weight: 700;
    }

    .result-loss {
      color: var(--orange);
      font-weight: 700;
    }

    .elo-positive {
      color: #4ade80;
      font-weight: 600;
    }

    .elo-negative {
      color: var(--orange);
      font-weight: 600;
    }

    .elo-zero {
      color: var(--muted);
    }

    /* Leaderboard */
    .lb-row {
      display: grid;
      grid-template-columns: 40px 1fr 80px 90px 70px;
      align-items: center;
      gap: 8px;
      padding: 8px 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.82rem;
    }

    .lb-header {
      color: var(--muted);
      font-weight: 600;
      font-size: 0.75rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
      padding-bottom: 8px;
    }

    .lb-rank {
      color: var(--muted);
      text-align: center;
    }

    .lb-rank.top3 {
      color: var(--gold);
      font-weight: 700;
    }

    .lb-name {
      color: var(--text);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lb-elo {
      color: var(--blue);
      font-weight: 700;
      text-align: right;
    }

    .lb-wl {
      color: var(--muted);
      text-align: right;
    }

    .lb-mp {
      color: var(--muted);
      text-align: right;
    }

    .empty {
      text-align: center;
      color: var(--muted);
      padding: 32px 0;
      font-size: 0.875rem;
    }

    .loading {
      text-align: center;
      color: var(--muted);
      padding: 24px 0;
      font-size: 0.875rem;
    }

    .error {
      text-align: center;
      color: var(--orange);
      padding: 16px 0;
      font-size: 0.875rem;
    }
  `;

  // ── Public API ─────────────────────────────────────────────────────────────

  openModal(persistentId: string): void {
    this.persistentId = persistentId;
    this.open = true;
    this.activeTab = "history";
    void this.loadHistory();
  }

  closeModal(): void {
    this.open = false;
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  private async loadHistory(): Promise<void> {
    if (!this.persistentId) return;
    this.loadingHistory = true;
    this.errorHistory = null;
    this.stats = null;
    this.history = [];
    try {
      const [histRes, statsRes] = await Promise.all([
        fetch(`/api/player/history/${encodeURIComponent(this.persistentId)}`),
        fetch(`/api/player/stats/${encodeURIComponent(this.persistentId)}`),
      ]);
      if (histRes.ok) {
        this.history = (await histRes.json()) as MatchHistoryEntry[];
      } else {
        this.errorHistory = `Error ${histRes.status}: ${histRes.statusText}`;
      }
      if (statsRes.ok) {
        this.stats = (await statsRes.json()) as PlayerStats;
      }
    } catch (err) {
      this.errorHistory = "Failed to load match history.";
    } finally {
      this.loadingHistory = false;
    }
  }

  private async loadLeaderboard(): Promise<void> {
    if (this.leaderboard.length > 0) return; // already loaded
    this.loadingLeaderboard = true;
    this.errorLeaderboard = null;
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        this.leaderboard = (await res.json()) as LeaderboardEntry[];
      } else {
        this.errorLeaderboard = `Error ${res.status}: ${res.statusText}`;
      }
    } catch {
      this.errorLeaderboard = "Failed to load leaderboard.";
    } finally {
      this.loadingLeaderboard = false;
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private onTabClick(tab: "history" | "leaderboard"): void {
    this.activeTab = tab;
    if (tab === "leaderboard") {
      void this.loadLeaderboard();
    }
  }

  private renderHeader() {
    const s = this.stats;
    const winRate =
      s && s.matchesPlayed > 0
        ? ((s.wins / s.matchesPlayed) * 100).toFixed(1)
        : "—";

    return html`
      <div class="header">
        <div class="header-info">
          <div class="player-name">${s?.displayName ?? "Player"}</div>
          ${s
            ? html`
                <div class="elo-badge">
                  ${s.eloLabel}
                  <span class="elo-number">${s.eloRating}</span>
                </div>
                <div class="stat-chips">
                  <div class="stat-chip">Win Rate <span>${winRate}%</span></div>
                  <div class="stat-chip">
                    Matches <span>${s.matchesPlayed}</span>
                  </div>
                  <div class="stat-chip">
                    W/L <span>${s.wins}/${s.losses}</span>
                  </div>
                </div>
              `
            : ""}
        </div>
        <button class="close-btn" @click=${this.closeModal}>&#x2715;</button>
      </div>
    `;
  }

  private renderHistoryTab() {
    if (this.loadingHistory) {
      return html`<div class="loading">Loading match history…</div>`;
    }
    if (this.errorHistory) {
      return html`<div class="error">${this.errorHistory}</div>`;
    }
    if (this.history.length === 0) {
      return html`<div class="empty">No matches recorded yet.</div>`;
    }

    return html`
      <table>
        <thead>
          <tr>
            <th>Map</th>
            <th>Result</th>
            <th>Elo</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${this.history.map((m) => {
            const deltaStr =
              m.eloDelta > 0
                ? `+${m.eloDelta}`
                : m.eloDelta < 0
                  ? String(m.eloDelta)
                  : "±0";
            const deltaClass =
              m.eloDelta > 0
                ? "elo-positive"
                : m.eloDelta < 0
                  ? "elo-negative"
                  : "elo-zero";
            const date = new Date(m.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            return html`
              <tr>
                <td>${m.mapName || "—"}</td>
                <td class="${m.won ? "result-win" : "result-loss"}">
                  ${m.won ? "Win" : "Loss"}
                </td>
                <td>
                  <span class="${deltaClass}">${deltaStr}</span>
                  <span style="color:var(--muted);font-size:0.75em">
                    (${m.eloAfter})
                  </span>
                </td>
                <td style="color:var(--muted)">${date}</td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    `;
  }

  private renderLeaderboardTab() {
    if (this.loadingLeaderboard) {
      return html`<div class="loading">Loading leaderboard…</div>`;
    }
    if (this.errorLeaderboard) {
      return html`<div class="error">${this.errorLeaderboard}</div>`;
    }
    if (this.leaderboard.length === 0) {
      return html`<div class="empty">No ranked players yet.</div>`;
    }

    return html`
      <div class="lb-row lb-header">
        <div class="lb-rank">#</div>
        <div class="lb-name">Player</div>
        <div class="lb-elo">Elo</div>
        <div class="lb-wl">W/L</div>
        <div class="lb-mp">Played</div>
      </div>
      ${this.leaderboard.map(
        (e) => html`
          <div class="lb-row">
            <div class="lb-rank ${e.rank <= 3 ? "top3" : ""}">${e.rank}</div>
            <div class="lb-name">
              ${e.displayName || e.persistentId.slice(0, 8)}
            </div>
            <div class="lb-elo">${e.eloRating}</div>
            <div class="lb-wl">${e.wins}/${e.matchesPlayed - e.wins}</div>
            <div class="lb-mp">${e.matchesPlayed}</div>
          </div>
        `,
      )}
    `;
  }

  render() {
    if (!this.open) return html``;

    return html`
      <div
        class="backdrop"
        @click=${(e: MouseEvent) => {
          if ((e.target as HTMLElement).classList.contains("backdrop")) {
            this.closeModal();
          }
        }}
      >
        <div class="modal">
          ${this.renderHeader()}
          <div class="tabs">
            <button
              class="tab ${this.activeTab === "history" ? "active" : ""}"
              @click=${() => this.onTabClick("history")}
            >
              Match History
            </button>
            <button
              class="tab ${this.activeTab === "leaderboard" ? "active" : ""}"
              @click=${() => this.onTabClick("leaderboard")}
            >
              Leaderboard
            </button>
          </div>
          <div class="body">
            ${this.activeTab === "history"
              ? this.renderHistoryTab()
              : this.renderLeaderboardTab()}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "history-modal": HistoryModal;
  }
}
