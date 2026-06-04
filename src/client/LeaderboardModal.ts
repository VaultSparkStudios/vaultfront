import { html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { fetchPredictionLeaderboard } from "./Api";
import { BaseModal } from "./components/BaseModal";
import "./components/leaderboard/LeaderboardClanTable";
import type { LeaderboardClanTable } from "./components/leaderboard/LeaderboardClanTable";
import "./components/leaderboard/LeaderboardPlayerList";
import type { LeaderboardPlayerList } from "./components/leaderboard/LeaderboardPlayerList";
import "./components/leaderboard/LeaderboardTabs";
import type { LeaderboardTab } from "./components/leaderboard/LeaderboardTabs";
import { modalHeader } from "./components/ui/ModalHeader";
import { translateText } from "./Utils";

@customElement("leaderboard-modal")
export class LeaderboardModal extends BaseModal {
  @state() private activeTab: LeaderboardTab = "players";
  @state()
  private clanDateRange: { start: string; end: string } | null = null;
  @state()
  private predictionLeaderboard: Array<{
    spectatorId: string;
    accuracy: number;
    totalPredictions: number;
    weeklyScore: number;
  }> = [];
  @state() private predictionLoading = false;

  @query("leaderboard-player-list")
  private playerList?: LeaderboardPlayerList;
  @query("leaderboard-clan-table")
  private clanTable?: LeaderboardClanTable;

  private loadToken = 0;

  protected onOpen(): void {
    this.loadActiveTabData();
  }

  private loadActiveTabData() {
    const token = ++this.loadToken;

    const run = async () => {
      if (token !== this.loadToken) return;

      if (this.activeTab === "players") {
        await this.playerList?.ensureLoaded();
        if (token !== this.loadToken) return;
        this.playerList?.handleTabActivated();
      } else if (this.activeTab === "clans") {
        await this.clanTable?.ensureLoaded();
      } else if (this.activeTab === "predictions") {
        void this.loadPredictionLeaderboard();
      }

      queueMicrotask(() => {
        if (token !== this.loadToken) return;
        if (this.activeTab === "players") void this.clanTable?.ensureLoaded();
        else if (this.activeTab === "clans")
          void this.playerList?.ensureLoaded();
      });
    };

    void (async () => {
      const needsQuery =
        this.activeTab === "players" ? this.playerList : this.clanTable;
      if (this.activeTab !== "predictions" && !needsQuery) {
        await this.updateComplete;
      }
      await run();
    })();
  }

  private async loadPredictionLeaderboard() {
    if (this.predictionLoading) return;
    this.predictionLoading = true;
    const data = await fetchPredictionLeaderboard(true);
    this.predictionLeaderboard = data;
    this.predictionLoading = false;
  }

  private handleTabChange(tab: LeaderboardTab) {
    this.activeTab = tab;
    this.loadActiveTabData();
  }

  private handleClanDateRangeChange(
    event: CustomEvent<{ start: string; end: string }>,
  ) {
    this.clanDateRange = event.detail;
  }

  private renderPredictionTab() {
    if (this.predictionLoading) {
      return html`<div
        class="flex items-center justify-center h-full text-white/40 text-sm"
      >
        Loading…
      </div>`;
    }
    if (this.predictionLeaderboard.length === 0) {
      return html`<div
        class="flex items-center justify-center h-full text-white/40 text-sm"
      >
        No predictions recorded yet this week.
      </div>`;
    }
    return html`
      <div class="overflow-auto h-full">
        <table class="w-full text-sm text-white/80">
          <thead class="text-white/40 uppercase text-xs">
            <tr>
              <th class="text-left py-2 px-3">#</th>
              <th class="text-left py-2 px-3">Spectator</th>
              <th class="text-right py-2 px-3">Accuracy</th>
              <th class="text-right py-2 px-3">Predictions</th>
              <th class="text-right py-2 px-3">Weekly Score</th>
            </tr>
          </thead>
          <tbody>
            ${this.predictionLeaderboard.map(
              (entry, i) => html`
                <tr class="border-t border-white/5 hover:bg-white/5">
                  <td class="py-2 px-3 text-white/40">${i + 1}</td>
                  <td class="py-2 px-3 font-mono text-xs">
                    ${entry.spectatorId.slice(0, 12)}…
                  </td>
                  <td class="py-2 px-3 text-right font-bold text-green-400">
                    ${entry.accuracy}%
                  </td>
                  <td class="py-2 px-3 text-right">
                    ${entry.totalPredictions}
                  </td>
                  <td class="py-2 px-3 text-right text-yellow-300">
                    ${entry.weeklyScore}
                  </td>
                </tr>
              `,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  render() {
    let dateRange = html``;
    if (this.clanDateRange) {
      const start = new Date(this.clanDateRange.start).toLocaleDateString();
      const end = new Date(this.clanDateRange.end).toLocaleDateString();
      dateRange = html`<span
        class="text-sm font-normal text-white/40 ml-2 wrap-break-words"
        >(${start} - ${end})</span
      >`;
    }
    const refreshTime = html`<span
      class="text-sm font-normal text-white/40 ml-2 wrap-break-words italic"
      >(${translateText("leaderboard_modal.refresh_time")})</span
    >`;

    const content = html`
      <div class="${this.modalContainerClass}">
        ${modalHeader({
          titleContent: html`
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="text-white text-xl sm:text-2xl font-bold uppercase tracking-widest"
              >
                ${translateText("leaderboard_modal.title")}
              </span>
              ${this.activeTab === "clans" ? dateRange : ""}
              ${this.activeTab === "players" ? refreshTime : ""}
            </div>
          `,
          onBack: () => this.close(),
          ariaLabel: translateText("common.close"),
        })}

        <div class="flex-1 flex flex-col min-h-0">
          <leaderboard-tabs
            .activeTab=${this.activeTab}
            @tab-change=${(event: CustomEvent<LeaderboardTab>) =>
              this.handleTabChange(event.detail)}
          ></leaderboard-tabs>
          <div class="flex-1 min-h-0">
            <leaderboard-player-list
              class=${this.activeTab === "players" ? "h-full" : "hidden"}
            ></leaderboard-player-list>
            <leaderboard-clan-table
              class=${this.activeTab === "clans" ? "h-full" : "hidden"}
              @date-range-change=${(
                event: CustomEvent<{ start: string; end: string }>,
              ) => this.handleClanDateRangeChange(event)}
            ></leaderboard-clan-table>
            ${this.activeTab === "predictions"
              ? this.renderPredictionTab()
              : ""}
          </div>
        </div>
      </div>
    `;

    if (this.inline) return content;

    return html`
      <o-modal
        id="leaderboard-modal"
        ?inline=${this.inline}
        hideCloseButton
        hideHeader
      >
        ${content}
      </o-modal>
    `;
  }
}
