/**
 * TournamentBracketView — single-elimination bracket visualization.
 * Renders rounds as columns with match boxes and winner progression lines.
 */

import { css, html, LitElement, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getApiBase } from "./Api";

interface BracketMatch {
  id: number;
  round: number;
  matchIndex: number;
  playerA: string | null;
  playerB: string | null;
  winnerId: string | null;
  status: "pending" | "active" | "complete";
}

interface BracketSlot {
  persistentId: string;
  seed: number;
  eloAtEntry: number;
}

interface TournamentMeta {
  id: string;
  name: string;
  mapName: string;
  status: "registration" | "active" | "complete";
}

interface BracketView {
  tournament: TournamentMeta;
  rounds: BracketMatch[][];
  slots: BracketSlot[];
}

const BOX_W = 150;
const BOX_H = 44;
const COL_GAP = 64;
const ROW_GAP = 16;

@customElement("tournament-bracket-view")
export class TournamentBracketView extends LitElement {
  @state() private bracket: BracketView | null = null;
  @state() private loading = false;
  @state() private error: string | null = null;
  @state() private myPersistentId = "";

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
      margin-bottom: 16px;
    }
    .title {
      font-size: 1rem;
      font-weight: 700;
    }
    .status-chip {
      font-size: 0.72rem;
      padding: 2px 10px;
      border-radius: 10px;
      background: rgba(71, 85, 105, 0.4);
      color: #94a3b8;
      text-transform: capitalize;
    }
    .status-chip.active {
      background: rgba(52, 211, 153, 0.15);
      color: #6ee7b7;
    }
    .status-chip.complete {
      background: rgba(251, 191, 36, 0.15);
      color: #fcd34d;
    }
    .scroll-wrap {
      overflow-x: auto;
      padding-bottom: 8px;
    }
    .empty {
      color: #64748b;
      padding: 32px;
      text-align: center;
    }
    .round-label {
      font-size: 0.68rem;
      fill: #64748b;
      text-anchor: middle;
      font-family: "Overpass", sans-serif;
    }
    .match-box {
      rx: 6;
      ry: 6;
    }
    .player-name {
      font-size: 11px;
      font-family: "Overpass", sans-serif;
      dominant-baseline: middle;
    }
    .seed-label {
      font-size: 9px;
      font-family: "Overpass", sans-serif;
      dominant-baseline: middle;
      fill: #64748b;
    }
    .connector {
      stroke: rgba(71, 85, 105, 0.5);
      stroke-width: 1.5;
      fill: none;
    }
    .connector.winner {
      stroke: rgba(52, 211, 153, 0.7);
    }
  `;

  async loadTournament(
    tournamentId: string,
    myPersistentId = "",
  ): Promise<void> {
    this.myPersistentId = myPersistentId;
    this.loading = true;
    this.error = null;
    try {
      const res = await fetch(
        `${getApiBase()}/api/tournaments/${tournamentId}/bracket`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.bracket = (await res.json()) as BracketView;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Failed to load bracket";
    }
    this.loading = false;
  }

  private seedOf(persistentId: string): number {
    return (
      this.bracket?.slots.find((s) => s.persistentId === persistentId)?.seed ??
      0
    );
  }

  private eloOf(persistentId: string): number {
    return (
      this.bracket?.slots.find((s) => s.persistentId === persistentId)
        ?.eloAtEntry ?? 0
    );
  }

  private renderSvg(rounds: BracketMatch[][]) {
    const numRounds = rounds.length;
    const maxMatches = rounds[0]?.length ?? 1;
    const svgW = numRounds * (BOX_W + COL_GAP) + 16;

    // Height based on first round (most matches)
    const svgH = maxMatches * (BOX_H + ROW_GAP) + 60;

    const matchY = (round: number, matchIndex: number): number => {
      // Matches in later rounds are spaced wider to center between pairs
      const stride = Math.pow(2, round) * (BOX_H + ROW_GAP);
      const offset = (stride - BOX_H) / 2;
      return 40 + matchIndex * stride + offset;
    };

    const matchX = (round: number): number => round * (BOX_W + COL_GAP) + 8;

    const boxes: unknown[] = [];
    const connectors: unknown[] = [];

    for (let r = 0; r < rounds.length; r++) {
      const roundLabel =
        r === rounds.length - 1
          ? "Final"
          : r === rounds.length - 2
            ? "Semis"
            : `Round ${r + 1}`;
      const labelX = matchX(r) + BOX_W / 2;
      boxes.push(
        svg`<text class="round-label" x=${labelX} y="22">${roundLabel}</text>`,
      );

      for (let m = 0; m < rounds[r].length; m++) {
        const match = rounds[r][m];
        const x = matchX(r);
        const y = matchY(r, m);
        const isActive = match.status === "active";
        const isComplete = match.status === "complete";

        const boxFill = isActive
          ? "rgba(30, 58, 138, 0.7)"
          : "rgba(15, 23, 42, 0.8)";
        const boxStroke = isActive
          ? "rgba(96, 165, 250, 0.7)"
          : "rgba(71, 85, 105, 0.5)";

        const playerAIsWinner = isComplete && match.winnerId === match.playerA;
        const playerBIsWinner = isComplete && match.winnerId === match.playerB;
        const isMine =
          match.playerA === this.myPersistentId ||
          match.playerB === this.myPersistentId;

        boxes.push(svg`
          <rect class="match-box" x=${x} y=${y} width=${BOX_W} height=${BOX_H}
            fill=${isMine ? "rgba(30, 58, 138, 0.5)" : boxFill}
            stroke=${isMine ? "rgba(139, 92, 246, 0.8)" : boxStroke}
            stroke-width="1.5"
          />
          <line x1=${x} y1=${y + BOX_H / 2} x2=${x + BOX_W} y2=${y + BOX_H / 2}
            stroke="rgba(71,85,105,0.3)" stroke-width="0.8"
          />
          <!-- Player A row -->
          <text class="seed-label" x=${x + 8} y=${y + BOX_H / 4}>#${this.seedOf(match.playerA ?? "")}</text>
          <text class="player-name"
            x=${x + 28} y=${y + BOX_H / 4}
            fill=${playerAIsWinner ? "#4ade80" : "#e2e8f0"}
            font-weight=${playerAIsWinner ? "700" : "400"}
          >${match.playerA?.slice(0, 10) ?? "TBD"}</text>
          ${playerAIsWinner ? svg`<text x=${x + BOX_W - 12} y=${y + BOX_H / 4} font-size="10" fill="#4ade80" text-anchor="middle" dominant-baseline="middle">✓</text>` : ""}
          <!-- Player B row -->
          <text class="seed-label" x=${x + 8} y=${y + (BOX_H * 3) / 4}>#${this.seedOf(match.playerB ?? "")}</text>
          <text class="player-name"
            x=${x + 28} y=${y + (BOX_H * 3) / 4}
            fill=${playerBIsWinner ? "#4ade80" : "#e2e8f0"}
            font-weight=${playerBIsWinner ? "700" : "400"}
          >${match.playerB?.slice(0, 10) ?? "TBD"}</text>
          ${playerBIsWinner ? svg`<text x=${x + BOX_W - 12} y=${y + (BOX_H * 3) / 4} font-size="10" fill="#4ade80" text-anchor="middle" dominant-baseline="middle">✓</text>` : ""}
        `);

        // Draw connector to parent match in next round
        if (r < rounds.length - 1) {
          const nextMatchIndex = Math.floor(m / 2);
          const ny = matchY(r + 1, nextMatchIndex);
          const nx = matchX(r + 1);
          const targetY = m % 2 === 0 ? ny + BOX_H / 4 : ny + (BOX_H * 3) / 4;
          const midX = x + BOX_W + COL_GAP / 2;
          const srcY = y + BOX_H / 2;
          const isWinnerConnector = isComplete;
          connectors.push(svg`
            <path class="connector ${isWinnerConnector ? "winner" : ""}"
              d="M ${x + BOX_W} ${srcY} H ${midX} V ${targetY} H ${nx}"
            />
          `);
        }
      }
    }

    return svg`
      <svg width=${svgW} height=${svgH} xmlns="http://www.w3.org/2000/svg">
        ${connectors}
        ${boxes}
      </svg>
    `;
  }

  render() {
    if (this.loading) return html`<div class="empty">Loading bracket…</div>`;
    if (this.error) return html`<div class="empty">Error: ${this.error}</div>`;
    if (!this.bracket) return html`<div class="empty">No bracket loaded.</div>`;

    const { tournament, rounds } = this.bracket;
    const statusClass =
      tournament.status === "active"
        ? "active"
        : tournament.status === "complete"
          ? "complete"
          : "";

    return html`
      <div class="header">
        <span class="title">${tournament.name}</span>
        <span class="status-chip ${statusClass}">${tournament.status}</span>
        ${tournament.mapName
          ? html`<span class="status-chip">${tournament.mapName}</span>`
          : ""}
      </div>
      <div class="scroll-wrap">
        ${rounds.length > 0
          ? this.renderSvg(rounds)
          : html`<div class="empty">Bracket not yet seeded.</div>`}
      </div>
    `;
  }
}

if (!customElements.get("tournament-bracket-view")) {
  customElements.define("tournament-bracket-view", TournamentBracketView);
}
