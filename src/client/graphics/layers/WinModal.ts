import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  getGamesPlayed,
  isInIframe,
  translateText,
  TUTORIAL_VIDEO_URL,
} from "../../../client/Utils";
import { ColorPalette, Pattern } from "../../../core/CosmeticSchemas";
import { EventBus } from "../../../core/EventBus";
import { RankedType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { appRelativePath, appRootPath } from "../../../core/RuntimeUrls";
import type { WinUpdate } from "../../../core/game/GameUpdates";
import type { AllPlayersStats, Winner } from "../../../core/Schemas";
import {
  fetchVaultFrontRecapAssignment,
  getUserMe,
  recordVaultFrontFunnelTelemetry,
  recordVaultFrontOutcomeTelemetry,
  recordVaultFrontRecapEvent,
  updateVaultFrontSeasonContracts,
  VaultFrontSeasonContractState,
} from "../../Api";
import "../../components/PatternButton";
import {
  fetchCosmetics,
  handlePurchase,
  patternRelationship,
} from "../../Cosmetics";
import { crazyGamesSDK } from "../../CrazyGamesSDK";
import { Platform } from "../../Platform";
import { SendWinnerEvent } from "../../Transport";
import { Layer } from "./Layer";
import { GoToPositionEvent } from "./Leaderboard";

interface RecapCard {
  key: "vault" | "convoy" | "pulse" | "focus";
  title: string;
  myValue: string;
  winnerValue: string;
  deltaText: string;
  positive: boolean;
  ratio: number;
}

interface SeasonalContract {
  title: string;
  description: string;
  progress: number;
  target: number;
}

interface ReplayMoment {
  id: string;
  label: string;
  tile: number | null;
  scope: "personal" | "team" | "global";
}

@customElement("win-modal")
export class WinModal extends LitElement implements Layer {
  public game: GameView;
  public eventBus: EventBus;

  private hasShownDeathModal = false;

  @state()
  isVisible = false;

  @state()
  showButtons = false;

  @state()
  private isWin = false;

  @state()
  private isRankedGame = false;

  @state()
  private patternContent: TemplateResult | null = null;

  @state()
  private recapCards: RecapCard[] = [];

  @state()
  private recapReason = "";

  @state()
  private actionableHint = "";

  @state()
  private momentRewards: string[] = [];

  private actionableGoalKey:
    | "vault_first"
    | "convoy_impact"
    | "pulse_chain"
    | "focus_stable"
    | "" = "";

  @state()
  private nextGoalSaved = false;

  @state()
  private seasonalContracts: SeasonalContract[] = [];

  @state()
  private replayMoments: ReplayMoment[] = [];

  @state()
  private recapCtaVariant: "goal_focus" | "requeue_focus" = "goal_focus";

  private _title: string;

  private rand = Math.random();
  private kpiRecorded = false;
  private recapExposureTracked = false;
  private recapGoalClicked = false;
  private recapRequeueClicked = false;
  private outcomePosted = false;
  private behindAtMinute8 = false;
  private matchLengthSeconds = 0;

  // Override to prevent shadow DOM creation
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
  }

  render() {
    return html`
      <div
        class="${this.isVisible
          ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800/70 p-6 shrink-0 rounded-lg z-9999 shadow-2xl backdrop-blur-xs text-white w-87.5 max-w-[90%] md:w-175"
          : "hidden"}"
      >
        <h2 class="m-0 mb-4 text-[26px] text-center text-white">
          ${this._title || ""}
        </h2>
        ${this.renderRecapSection()}
        ${this.innerHtml()}
        <div
          class="${this.showButtons
            ? "flex justify-between gap-2.5"
            : "hidden"}"
        >
          <button
            @click=${this._handleExit}
            class="flex-1 px-3 py-3 text-base cursor-pointer bg-blue-500/60 text-white border-0 rounded-sm transition-all duration-200 hover:bg-blue-500/80 hover:-translate-y-px active:translate-y-px"
          >
            ${translateText("win_modal.exit")}
          </button>
          ${this.isRankedGame
            ? html`
                <button
                  @click=${this._handleRequeue}
                  class="flex-1 px-3 py-3 text-base cursor-pointer bg-purple-600 text-white border-0 rounded-sm transition-all duration-200 hover:bg-purple-500 hover:-translate-y-px active:translate-y-px"
                >
                  ${translateText("win_modal.requeue")}
                </button>
              `
            : null}
          <button
            @click=${this.hide}
            class="flex-1 px-3 py-3 text-base cursor-pointer bg-blue-500/60 text-white border-0 rounded-sm transition-all duration-200 hover:bg-blue-500/80 hover:-translate-y-px active:translate-y-px"
          >
            ${this.game?.myPlayer()?.isAlive()
              ? translateText("win_modal.keep")
              : translateText("win_modal.spectate")}
          </button>
        </div>
      </div>
    `;
  }

  private renderRecapSection() {
    if (this.recapCards.length === 0) return null;
    const requeuePrimary =
      this.recapCtaVariant === "requeue_focus" && this.isRankedGame;

    return html`
      <div class="mb-4 rounded-sm border border-slate-500/50 bg-black/25 p-3">
        <div class="text-base font-semibold text-cyan-100 mb-2">
          VaultFront Match Recap
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          ${this.recapCards.map(
            (card) => html`
              <div
                class="rounded-sm border ${card.positive
                  ? "border-emerald-400/50 bg-emerald-900/25"
                  : "border-rose-400/50 bg-rose-900/20"} p-2"
              >
                <div class="text-xs uppercase tracking-wide text-slate-300">
                  ${card.title}
                </div>
                <div class="text-sm text-white mt-0.5">
                  You: ${card.myValue} | Winners: ${card.winnerValue}
                </div>
                <div
                  class="text-xs mt-1 ${card.positive
                    ? "text-emerald-200"
                    : "text-rose-200"}"
                >
                  ${card.deltaText}
                </div>
              </div>
            `,
          )}
        </div>

        <div class="mt-2 text-sm text-slate-100">${this.recapReason}</div>
        ${this.momentRewards.length > 0
          ? html`<div class="mt-2 rounded-sm border border-cyan-400/35 bg-cyan-900/20 p-2">
              <div class="text-xs uppercase tracking-wide text-cyan-200">
                Moment Rewards
              </div>
              <div class="mt-1 flex flex-wrap gap-1.5">
                ${this.momentRewards.map(
                  (moment) => html`<span
                    class="rounded border border-cyan-300/35 bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-50"
                    >${moment}</span
                  >`,
                )}
              </div>
            </div>`
          : ""}

        <div class="mt-2 rounded-sm border border-amber-400/40 bg-amber-900/25 p-2">
          <div class="text-xs uppercase tracking-wide text-amber-200">
            Next Match Hint
          </div>
          <div class="text-sm text-amber-100 mt-1">${this.actionableHint}</div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              class="px-3 py-1.5 text-sm cursor-pointer border-0 rounded-sm transition-colors ${requeuePrimary
                ? "bg-fuchsia-500/80 text-white hover:bg-fuchsia-400"
                : "bg-amber-500/70 text-black hover:bg-amber-400"}"
              @click=${requeuePrimary
                ? this.onRecapPrimaryRequeueClick
                : this.saveNextMatchGoal}
            >
              ${requeuePrimary
                ? "Queue Next Ranked Match"
                : this.nextGoalSaved
                  ? "Goal Saved"
                  : "Set As Next Match Goal"}
            </button>
            ${requeuePrimary
              ? html`
                  <button
                    class="px-3 py-1.5 text-sm cursor-pointer bg-amber-500/70 text-black border-0 rounded-sm hover:bg-amber-400 transition-colors"
                    @click=${this.saveNextMatchGoal}
                  >
                    ${this.nextGoalSaved ? "Goal Saved" : "Save Goal Instead"}
                  </button>
                `
              : null}
          </div>
        </div>

        ${this.renderSeasonalContracts()}
        ${this.renderReplayMoments()}
      </div>
    `;
  }

  private renderSeasonalContracts() {
    if (this.seasonalContracts.length === 0) return null;

    return html`
      <div class="mt-2 rounded-sm border border-indigo-400/45 bg-indigo-900/20 p-2">
        <div class="text-xs uppercase tracking-wide text-indigo-200 mb-1">
          Seasonal Skill Contracts
        </div>
        <div class="space-y-2">
          ${this.seasonalContracts.map((contract) => {
            const ratio = Math.max(
              0,
              Math.min(1, contract.target > 0 ? contract.progress / contract.target : 0),
            );
            return html`
              <div>
                <div class="text-sm text-white">${contract.title}</div>
                <div class="text-xs text-slate-200">${contract.description}</div>
                <div class="mt-1 h-1.5 rounded bg-white/20 overflow-hidden">
                  <div
                    class="h-full bg-indigo-300"
                    style="width: ${ratio * 100}%"
                  ></div>
                </div>
                <div class="text-[11px] text-indigo-100 mt-0.5">
                  ${contract.progress}/${contract.target}
                </div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  private renderReplayMoments() {
    if (this.replayMoments.length === 0) return null;
    return html`
      <div class="mt-2 rounded-sm border border-cyan-400/45 bg-cyan-900/20 p-2">
        <div class="text-xs uppercase tracking-wide text-cyan-200 mb-1">
          Replay Moments
        </div>
        <div class="text-sm text-cyan-50 space-y-1">
          ${this.replayMoments.map(
            (moment) => html`
              <button
                class="w-full text-left rounded px-2 py-1 bg-cyan-500/15 hover:bg-cyan-500/25"
                @click=${() => this.jumpToReplayMoment(moment)}
                ?disabled=${moment.tile === null}
                title=${moment.tile === null
                  ? "No map location available for this moment"
                  : "Jump camera to this replay moment"}
              >
                <span class="inline-block mr-1 text-[10px] uppercase tracking-wide text-cyan-200">
                  ${moment.scope}
                </span>
                ${moment.label}
              </button>
            `,
          )}
        </div>
      </div>
    `;
  }

  innerHtml() {
    if (isInIframe()) {
      return this.steamWishlist();
    }

    if (!this.isWin && getGamesPlayed() < 3) {
      return this.renderYoutubeTutorial();
    }
    if (this.rand < 0.25) {
      return this.steamWishlist();
    } else if (this.rand < 0.5) {
      return this.discordDisplay();
    } else {
      return this.renderPatternButton();
    }
  }

  renderYoutubeTutorial() {
    return html`
      <div class="text-center mb-6 bg-black/30 p-2.5 rounded-sm">
        <h3 class="text-xl font-semibold text-white mb-3">
          ${translateText("win_modal.youtube_tutorial")}
        </h3>
        <!-- 56.25% = 9:16 -->
        <div class="relative w-full pb-[56.25%]">
          <iframe
            class="absolute top-0 left-0 w-full h-full rounded-sm"
            src="${this.isVisible ? TUTORIAL_VIDEO_URL : ""}"
            title="YouTube video player"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
      </div>
    `;
  }

  renderPatternButton() {
    return html`
      <div class="text-center mb-6 bg-black/30 p-2.5 rounded-sm">
        <h3 class="text-xl font-semibold text-white mb-3">
          ${translateText("win_modal.support_openfront")}
        </h3>
        <p class="text-white mb-3">
          ${translateText("win_modal.territory_pattern")}
        </p>
        <div class="flex justify-center">${this.patternContent}</div>
      </div>
    `;
  }

  async loadPatternContent() {
    const me = await getUserMe();
    const patterns = await fetchCosmetics();

    const purchasablePatterns: {
      pattern: Pattern;
      colorPalette: ColorPalette;
    }[] = [];

    for (const pattern of Object.values(patterns?.patterns ?? {})) {
      for (const colorPalette of pattern.colorPalettes ?? []) {
        if (
          patternRelationship(pattern, colorPalette, me, null) === "purchasable"
        ) {
          const palette = patterns?.colorPalettes?.[colorPalette.name];
          if (palette) {
            purchasablePatterns.push({
              pattern,
              colorPalette: palette,
            });
          }
        }
      }
    }

    if (purchasablePatterns.length === 0) {
      this.patternContent = html``;
      return;
    }

    // Shuffle the array and take patterns based on screen size
    const shuffled = [...purchasablePatterns].sort(() => Math.random() - 0.5);
    const maxPatterns = Platform.isMobileWidth ? 1 : 3;
    const selectedPatterns = shuffled.slice(
      0,
      Math.min(maxPatterns, shuffled.length),
    );

    this.patternContent = html`
      <div class="flex gap-4 flex-wrap justify-start">
        ${selectedPatterns.map(
          ({ pattern, colorPalette }) => html`
            <pattern-button
              .pattern=${pattern}
              .colorPalette=${colorPalette}
              .requiresPurchase=${true}
              .onSelect=${(p: Pattern | null) => {}}
              .onPurchase=${(p: Pattern, colorPalette: ColorPalette | null) =>
                handlePurchase(p, colorPalette)}
            ></pattern-button>
          `,
        )}
      </div>
    `;
  }

  steamWishlist(): TemplateResult {
    return html`<p class="m-0 mb-5 text-center bg-black/30 p-2.5 rounded-sm">
      <a
        href="https://store.steampowered.com/app/3560670"
        target="_blank"
        rel="noopener noreferrer"
        class="text-[#4a9eff] underline font-medium transition-colors duration-200 text-2xl hover:text-[#6db3ff]"
      >
        ${translateText("win_modal.wishlist")}
      </a>
    </p>`;
  }

  discordDisplay(): TemplateResult {
    return html`
      <div class="text-center mb-6 bg-black/30 p-2.5 rounded-sm">
        <h3 class="text-xl font-semibold text-white mb-3">
          ${translateText("win_modal.join_discord")}
        </h3>
        <p class="text-white mb-3">
          ${translateText("win_modal.discord_description")}
        </p>
        <a
          href="https://discord.com/invite/openfront"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block px-6 py-3 bg-indigo-600 text-white rounded-sm font-semibold transition-all duration-200 hover:bg-indigo-700 hover:-translate-y-px no-underline"
        >
          ${translateText("win_modal.join_server")}
        </a>
      </div>
    `;
  }

  async show() {
    crazyGamesSDK.gameplayStop();
    await this.loadPatternContent();
    await this.resolveRecapVariant();
    this.replayMoments = this.loadReplayMoments();
    // Check if this is a ranked game
    this.isRankedGame =
      this.game.config().gameConfig().rankedType === RankedType.OneVOne;
    this.isVisible = true;
    this.requestUpdate();
    setTimeout(() => {
      this.showButtons = true;
      this.requestUpdate();
    }, 3000);
    setTimeout(() => {
      void this.postOutcomeTelemetry();
    }, 15000);
  }

  hide() {
    void this.postOutcomeTelemetry();
    this.isVisible = false;
    this.showButtons = false;
    this.requestUpdate();
  }

  private saveNextMatchGoal = () => {
    if (!this.actionableHint) return;
    localStorage.setItem("vaultfront.nextMatchGoal", this.actionableHint);
    localStorage.setItem("vaultfront.nextMatchGoalKey", this.actionableGoalKey);
    this.nextGoalSaved = true;
    this.recapGoalClicked = true;
    void recordVaultFrontRecapEvent({
      event: "recap_goal_saved",
      variant: this.recapCtaVariant,
      value: 1,
    });
    void this.postOutcomeTelemetry();
  };

  private _handleExit() {
    void this.postOutcomeTelemetry();
    this.hide();
    window.location.href = appRootPath();
  }

  private _handleRequeue() {
    this.recapRequeueClicked = true;
    void recordVaultFrontRecapEvent({
      event: "recap_requeue_click",
      variant: this.recapCtaVariant,
      value: 1,
    });
    void this.postOutcomeTelemetry();
    this.hide();
    // Navigate to homepage and open matchmaking modal
    window.location.href = appRelativePath("?requeue");
  }

  private onRecapPrimaryRequeueClick = () => {
    this.recapRequeueClicked = true;
    void recordVaultFrontRecapEvent({
      event: "recap_primary_requeue_click",
      variant: this.recapCtaVariant,
      value: 1,
    });
    this._handleRequeue();
  };

  init() {}

  tick() {
    const myPlayer = this.game.myPlayer();
    if (
      !this.hasShownDeathModal &&
      myPlayer &&
      !myPlayer.isAlive() &&
      !this.game.inSpawnPhase() &&
      myPlayer.hasSpawned()
    ) {
      this.hasShownDeathModal = true;
      this._title = translateText("win_modal.died");
      this.recapCards = [];
      this.recapReason = "";
      this.actionableHint = "";
      this.seasonalContracts = [];
      this.show();
    }
    const updates = this.game.updatesSinceLastTick();
    const winUpdates = updates !== null ? updates[GameUpdateType.Win] : [];
    winUpdates.forEach((wu) => {
      if (wu.winner === undefined) {
        // ...
      } else if (wu.winner[0] === "team") {
        this.eventBus.emit(new SendWinnerEvent(wu.winner, wu.allPlayersStats));
        if (wu.winner[1] === this.game.myPlayer()?.team()) {
          this._title = translateText("win_modal.your_team");
          this.isWin = true;
          crazyGamesSDK.happytime();
        } else {
          this._title = translateText("win_modal.other_team", {
            team: wu.winner[1],
          });
          this.isWin = false;
        }
        this.recomputeRecap(wu);
        history.replaceState(null, "", `${window.location.pathname}?replay`);
        this.show();
      } else if (wu.winner[0] === "nation") {
        this._title = translateText("win_modal.nation_won", {
          nation: wu.winner[1],
        });
        this.isWin = false;
        this.recomputeRecap(wu);
        this.show();
      } else {
        const winner = this.game.playerByClientID(wu.winner[1]);
        if (!winner?.isPlayer()) return;
        const winnerClient = winner.clientID();
        if (winnerClient !== null) {
          this.eventBus.emit(
            new SendWinnerEvent(["player", winnerClient], wu.allPlayersStats),
          );
        }
        if (
          winnerClient !== null &&
          winnerClient === this.game.myPlayer()?.clientID()
        ) {
          this._title = translateText("win_modal.you_won");
          this.isWin = true;
          crazyGamesSDK.happytime();
        } else {
          this._title = translateText("win_modal.other_won", {
            player: winner.name(),
          });
          this.isWin = false;
        }
        this.recomputeRecap(wu);
        history.replaceState(null, "", `${window.location.pathname}?replay`);
        this.show();
      }
    });
  }

  renderLayer(/* context: CanvasRenderingContext2D */) {}

  shouldTransform(): boolean {
    return false;
  }

  private async resolveRecapVariant(): Promise<void> {
    const assignment = await fetchVaultFrontRecapAssignment();
    if (assignment !== false) {
      this.recapCtaVariant = assignment.variant;
    } else {
      this.recapCtaVariant = Math.random() < 0.5 ? "goal_focus" : "requeue_focus";
    }
    if (!this.recapExposureTracked) {
      this.recapExposureTracked = true;
      void recordVaultFrontRecapEvent({
        event: `recap_exposure_${this.recapCtaVariant}`,
        variant: this.recapCtaVariant,
        value: 1,
      });
    }
  }

  private hudCountersForCurrentMatch(): {
    vaultNoticeJumps: number;
    objectiveRailClicks: number;
    timelineJumps: number;
  } {
    const startAt = Date.now() - Math.max(60_000, this.matchLengthSeconds * 1000);
    const streamRaw = sessionStorage.getItem("vaultfront.hud.telemetry.stream");
    if (!streamRaw) {
      return {
        vaultNoticeJumps: 0,
        objectiveRailClicks: 0,
        timelineJumps: 0,
      };
    }
    try {
      const events = JSON.parse(streamRaw) as Array<{
        at: number;
        action: string;
      }>;
      return events.reduce(
        (acc, item) => {
          if ((item.at ?? 0) < startAt) return acc;
          if (item.action === "hud_vault_notice_jump") {
            acc.vaultNoticeJumps += 1;
          } else if (item.action === "hud_objective_rail_click") {
            acc.objectiveRailClicks += 1;
          } else if (item.action === "hud_timeline_jump") {
            acc.timelineJumps += 1;
          }
          return acc;
        },
        {
          vaultNoticeJumps: 0,
          objectiveRailClicks: 0,
          timelineJumps: 0,
        },
      );
    } catch {
      return {
        vaultNoticeJumps: 0,
        objectiveRailClicks: 0,
        timelineJumps: 0,
      };
    }
  }

  private funnelPhasesForCurrentMatch(): Record<
    "early" | "mid" | "late",
    Record<string, number>
  > {
    const summary: Record<"early" | "mid" | "late", Record<string, number>> = {
      early: {},
      mid: {},
      late: {},
    };
    const streamRaw = sessionStorage.getItem("vaultfront.hud.telemetry.stream");
    if (!streamRaw) return summary;
    const startAt = Date.now() - Math.max(60_000, this.matchLengthSeconds * 1000);
    const eventToCommand = (action: string): string | null => {
      if (action.startsWith("hud_command_reroute")) return "reroute";
      if (action === "hud_command_shield") return "escort";
      if (action === "hud_command_jam_breaker") return "jam_breaker";
      if (action.startsWith("hud_command_jam_next")) return "jam_next";
      if (action === "hud_role_ping") return "role_ping";
      if (action === "hud_focus_slider") return "resource_focus";
      return null;
    };
    try {
      const events = JSON.parse(streamRaw) as Array<{
        at: number;
        action: string;
      }>;
      for (const item of events) {
        if ((item.at ?? 0) < startAt) continue;
        const command = eventToCommand(item.action);
        if (!command) continue;
        const elapsedMs = Math.max(0, item.at - startAt);
        const bucket =
          elapsedMs < 300_000 ? "early" : elapsedMs < 900_000 ? "mid" : "late";
        summary[bucket][command] = (summary[bucket][command] ?? 0) + 1;
      }
      return summary;
    } catch {
      return summary;
    }
  }

  private async postOutcomeTelemetry(): Promise<void> {
    if (this.outcomePosted || this.matchLengthSeconds <= 0) return;
    const ok = await recordVaultFrontOutcomeTelemetry({
      won: this.isWin,
      behindAtMinute8: this.behindAtMinute8,
      matchLengthSeconds: this.matchLengthSeconds,
      recapCtaVariant: this.recapCtaVariant,
      recapCtaClicked: this.recapGoalClicked || this.recapRequeueClicked,
      requeueClicked: this.recapRequeueClicked,
      hud: this.hudCountersForCurrentMatch(),
    });
    void recordVaultFrontFunnelTelemetry({
      won: this.isWin,
      matchLengthSeconds: this.matchLengthSeconds,
      phases: this.funnelPhasesForCurrentMatch(),
    });
    if (ok) {
      this.outcomePosted = true;
    }
  }

  private toBigInt(v: unknown): bigint {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.floor(v));
    if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
    return 0n;
  }

  private fmt(value: bigint | number): string {
    const asNumber = typeof value === "bigint" ? Number(value) : value;
    return Number.isFinite(asNumber) ? asNumber.toLocaleString() : "0";
  }

  private winnerClientIDs(winner: Winner | undefined): string[] {
    if (!winner) return [];
    if (winner[0] === "player") return [winner[1]];
    if (winner[0] === "team") {
      return winner.slice(2) as string[];
    }
    return [];
  }

  private sumVaultMetric(
    stats: AllPlayersStats,
    clientIDs: string[],
    key: string,
  ): bigint {
    return clientIDs.reduce((acc, id) => {
      const raw = (stats[id]?.vaultfront as Record<string, unknown> | undefined)?.[
        key
      ];
      return acc + this.toBigInt(raw);
    }, 0n);
  }

  private focusDiscipline(changes: bigint, samples: bigint): number {
    const s = Number(samples);
    if (!Number.isFinite(s) || s <= 0) return 0;
    const c = Number(changes);
    const instability = (c * 1000) / s;
    return Math.max(0, Math.round(100 - Math.min(95, instability)));
  }

  private computeMomentRewards(
    myStats: AllPlayersStats[string] | undefined,
  ): string[] {
    const intercepts = Number(this.toBigInt(myStats?.vaultfront?.vaultConvoysIntercepted));
    const delivered = Number(this.toBigInt(myStats?.vaultfront?.vaultConvoysDelivered));
    const lost = Number(this.toBigInt(myStats?.vaultfront?.vaultConvoysLost));
    const pulses = Number(
      this.toBigInt(myStats?.vaultfront?.defenseFactoryPulseUptimeTicks),
    );
    const captures = Number(this.toBigInt(myStats?.vaultfront?.vaultCaptures));
    const cleanChains = Number(
      this.toBigInt(myStats?.vaultfront?.cleanExecutionStreaks),
    );
    const squadCompletions = Number(
      this.toBigInt(myStats?.vaultfront?.squadObjectiveCompletions),
    );
    const rewards: string[] = [];
    if (this.behindAtMinute8 && intercepts >= 1) {
      rewards.push("Clutch Intercept");
    }
    if (intercepts >= 3 || (intercepts >= 2 && captures >= 2)) {
      rewards.push("Deny Streak");
    }
    if (delivered >= 2 && lost === 0) {
      rewards.push("Convoy Guardian");
    }
    if (pulses >= 240) {
      rewards.push("Pulse Controller");
    }
    if (cleanChains > 0) {
      rewards.push("Clean Chain");
    }
    if (squadCompletions > 0) {
      rewards.push("Squad Sync");
    }
    return rewards.slice(0, 3);
  }

  private updateAdaptiveNudgeSignal(
    goalKey: "vault_first" | "convoy_impact" | "pulse_chain" | "focus_stable" | "",
    weak: boolean,
  ): void {
    if (!goalKey) return;
    const key = `vaultfront.nudge.fail.${goalKey}`;
    const current = Number(localStorage.getItem(key) ?? "0");
    const next = weak ? current + 1 : Math.max(0, current - 1);
    localStorage.setItem(key, String(next));
    if (next >= 2) {
      localStorage.setItem("vaultfront.adaptiveNudgeKey", goalKey);
    }
  }

  private recomputeRecap(wu: WinUpdate) {
    const myClientID = this.game.myPlayer()?.clientID();
    if (!myClientID) {
      this.recapCards = [];
      this.actionableHint = "";
      this.recapReason = "";
      this.momentRewards = [];
      this.seasonalContracts = [];
      this.matchLengthSeconds = 0;
      return;
    }

    this.recapExposureTracked = false;
    this.recapGoalClicked = false;
    this.recapRequeueClicked = false;
    this.outcomePosted = false;

    const allStats = wu.allPlayersStats;
    const winnerIDs = this.winnerClientIDs(wu.winner);
    const benchmarkIDs =
      winnerIDs.length > 0 ? winnerIDs : Object.keys(allStats).filter((k) => k !== myClientID);
    const myStats = allStats[myClientID];
    this.behindAtMinute8 =
      Number(this.toBigInt(myStats?.vaultfront?.minute8Behind)) > 0;
    this.matchLengthSeconds = Math.max(
      0,
      Math.floor(
        (this.game.ticks() - this.game.config().numSpawnPhaseTurns()) / 10,
      ),
    );
    if (!this.kpiRecorded) {
      this.recordKpis(myStats);
      this.kpiRecorded = true;
      sessionStorage.setItem("vaultfront.matchEndedAt", String(Date.now()));
    }

    const myVaultCaptures = this.toBigInt(myStats?.vaultfront?.vaultCaptures);
    const winnerVaultCaptures = this.sumVaultMetric(
      allStats,
      benchmarkIDs,
      "vaultCaptures",
    );

    const myConvoyImpact =
      this.toBigInt(myStats?.vaultfront?.vaultConvoysDelivered) +
      this.toBigInt(myStats?.vaultfront?.vaultConvoysIntercepted) -
      this.toBigInt(myStats?.vaultfront?.vaultConvoysLost);
    const winnerConvoyImpact =
      this.sumVaultMetric(allStats, benchmarkIDs, "vaultConvoysDelivered") +
      this.sumVaultMetric(allStats, benchmarkIDs, "vaultConvoysIntercepted") -
      this.sumVaultMetric(allStats, benchmarkIDs, "vaultConvoysLost");

    const myPulseTicks = this.toBigInt(
      myStats?.vaultfront?.defenseFactoryPulseUptimeTicks,
    );
    const winnerPulseTicks = this.sumVaultMetric(
      allStats,
      benchmarkIDs,
      "defenseFactoryPulseUptimeTicks",
    );

    const myFocusChanges = this.toBigInt(myStats?.vaultfront?.focusChanges);
    const myFocusSamples = this.toBigInt(myStats?.vaultfront?.focusSamples);
    const winnerFocusChanges = this.sumVaultMetric(
      allStats,
      benchmarkIDs,
      "focusChanges",
    );
    const winnerFocusSamples = this.sumVaultMetric(
      allStats,
      benchmarkIDs,
      "focusSamples",
    );
    const myDiscipline = this.focusDiscipline(myFocusChanges, myFocusSamples);
    const winnerDiscipline = this.focusDiscipline(
      winnerFocusChanges,
      winnerFocusSamples,
    );

    const cards: RecapCard[] = [
      this.buildCard("vault", "Vault Control", myVaultCaptures, winnerVaultCaptures),
      this.buildCard(
        "convoy",
        "Vault Convoy Impact",
        myConvoyImpact,
        winnerConvoyImpact,
      ),
      this.buildCard(
        "pulse",
        "Pulse Uptime",
        myPulseTicks / 10n,
        winnerPulseTicks / 10n,
        "s",
      ),
      this.buildCard(
        "focus",
        "Focus Discipline",
        BigInt(myDiscipline),
        BigInt(winnerDiscipline),
        "%",
      ),
    ];
    this.recapCards = cards;

    const weakness = [...cards].sort((a, b) => a.ratio - b.ratio)[0];
    this.actionableHint =
      weakness.key === "vault"
        ? "Secure one vault before minute 4 and hold it for at least one passive payout."
        : weakness.key === "convoy"
          ? "Shield your next Vault Convoy through friendly lanes or intercept one enemy Vault Convoy."
          : weakness.key === "pulse"
            ? "Build a Defense Factory earlier and aim to chain two pulse windows."
            : "Set Resource Focus once per phase and avoid rapid slider flips.";
    this.actionableGoalKey =
      weakness.key === "vault"
        ? "vault_first"
        : weakness.key === "convoy"
          ? "convoy_impact"
          : weakness.key === "pulse"
            ? "pulse_chain"
            : "focus_stable";
    this.nextGoalSaved = false;
    this.momentRewards = this.computeMomentRewards(myStats);
    this.updateAdaptiveNudgeSignal(this.actionableGoalKey, weakness.ratio < 0.95);

    const strengths = cards
      .filter((card) => card.positive)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 2)
      .map((c) => c.title.toLowerCase());
    const gaps = cards
      .filter((card) => !card.positive)
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 2)
      .map((c) => c.title.toLowerCase());
    this.recapReason =
      this.isWin && strengths.length > 0
        ? `Win reason: edge in ${strengths.join(" and ")}.`
        : !this.isWin && gaps.length > 0
          ? `Loss reason: deficits in ${gaps.join(" and ")}.`
          : "Result was close on the tracked objective metrics.";

    const seasonalMatch = {
      vaultCaptures: Number(myVaultCaptures),
      convoysIntercepted: Number(
        this.toBigInt(myStats?.vaultfront?.vaultConvoysIntercepted),
      ),
      convoysLost: Number(this.toBigInt(myStats?.vaultfront?.vaultConvoysLost)),
      convoysDelivered: Number(
        this.toBigInt(myStats?.vaultfront?.vaultConvoysDelivered),
      ),
      rivalryRevengeDelta: Number(
        localStorage.getItem("vaultfront.rivalryRevengeCount") ?? "0",
      ),
    };
    this.seasonalContracts = this.updateSeasonalContractsLocal(seasonalMatch);
    void this.syncSeasonalContracts(seasonalMatch);
  }

  private buildCard(
    key: RecapCard["key"],
    title: string,
    mine: bigint,
    winners: bigint,
    unit = "",
  ): RecapCard {
    const diff = mine - winners;
    const positive = diff >= 0n;
    const ratio =
      winners > 0n ? Number(mine) / Number(winners) : mine > 0n ? 1 : 0;
    const delta = positive ? `+${this.fmt(diff)}` : this.fmt(diff);
    return {
      key,
      title,
      myValue: `${this.fmt(mine)}${unit}`,
      winnerValue: `${this.fmt(winners)}${unit}`,
      deltaText: `Delta ${delta}${unit}`,
      positive,
      ratio,
    };
  }

  private async syncSeasonalContracts(match: {
    vaultCaptures: number;
    convoysIntercepted: number;
    convoysLost: number;
    convoysDelivered: number;
    rivalryRevengeDelta: number;
  }): Promise<void> {
    const serverState = await updateVaultFrontSeasonContracts({
      interceptionTimingDelta: Math.max(0, match.convoysIntercepted),
      objectiveDenialDelta: Math.max(
        0,
        match.vaultCaptures + match.convoysIntercepted,
      ),
      comebackExecutionDelta:
        match.convoysLost > 0 && match.convoysDelivered > 0 ? 1 : 0,
      rivalryRevengeDelta: Math.max(0, match.rivalryRevengeDelta),
    });
    if (!serverState) return;
    localStorage.removeItem("vaultfront.rivalryRevengeCount");
    this.seasonalContracts = this.contractCardsFromState(serverState);
    this.requestUpdate();
  }

  private contractCardsFromState(
    state: VaultFrontSeasonContractState,
  ): SeasonalContract[] {
    return [
      {
        title: "Interception Timing",
        description: "Intercept Vault Convoys at vulnerable route windows.",
        progress: state.interceptionTiming,
        target: 12,
      },
      {
        title: "Objective Denial",
        description: "Deny enemy objectives through vault captures + interceptions.",
        progress: state.objectiveDenial,
        target: 20,
      },
      {
        title: "Comeback Execution",
        description: "Lose a convoy, then deliver one in the same match.",
        progress: state.comebackExecution,
        target: 6,
      },
      {
        title: "Rivalry Revenge",
        description: "Counter-intercept rivals that intercepted your convoy earlier.",
        progress: state.rivalryRevenge,
        target: 8,
      },
    ];
  }

  private updateSeasonalContractsLocal(match: {
    vaultCaptures: number;
    convoysIntercepted: number;
    convoysLost: number;
    convoysDelivered: number;
    rivalryRevengeDelta: number;
  }): SeasonalContract[] {
    const now = new Date();
    const seasonId = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const key = "vaultfront.season.contracts";
    let state: {
      seasonId: string;
      interceptionTiming: number;
      objectiveDenial: number;
      comebackExecution: number;
      rivalryRevenge: number;
    } = {
      seasonId,
      interceptionTiming: 0,
      objectiveDenial: 0,
      comebackExecution: 0,
      rivalryRevenge: 0,
    };

    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as typeof state;
        if (parsed.seasonId === seasonId) {
          state = parsed;
        }
      } catch {
        // Ignore malformed local state and reset.
      }
    }

    state.interceptionTiming += Math.max(0, match.convoysIntercepted);
    state.objectiveDenial += Math.max(
      0,
      match.vaultCaptures + match.convoysIntercepted,
    );
    if (match.convoysLost > 0 && match.convoysDelivered > 0) {
      state.comebackExecution += 1;
    }
    state.rivalryRevenge += Math.max(0, match.rivalryRevengeDelta);
    localStorage.removeItem("vaultfront.rivalryRevengeCount");

    localStorage.setItem(key, JSON.stringify(state));

    return this.contractCardsFromState(state);
  }

  private jumpToReplayMoment(moment: ReplayMoment): void {
    if (moment.tile === null) return;
    this.eventBus.emit(
      new GoToPositionEvent(this.game.x(moment.tile), this.game.y(moment.tile)),
    );
    this.hide();
  }

  private loadReplayMoments(): ReplayMoment[] {
    const key = "vaultfront.matchTimeline";
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    let events: Array<{
      tick: number;
      activity: string;
      tile?: number;
      label: string;
      sourcePlayerID?: number | null;
      targetPlayerID?: number | null;
    }> = [];
    try {
      events = JSON.parse(raw) as Array<{
        tick: number;
        activity: string;
        tile?: number;
        label: string;
        sourcePlayerID?: number | null;
        targetPlayerID?: number | null;
      }>;
    } catch {
      return [];
    }

    const importantOrder: Record<string, number> = {
      comeback_surge: 5,
      convoy_intercepted: 4,
      vault_captured: 3,
      jam_breaker: 3,
      convoy_rerouted: 2,
      convoy_delivered: 2,
      beacon_pulse: 2,
    };

    const me = this.game.myPlayer();
    const myID = me?.smallID();
    const isFriendly = (id: number | null | undefined): boolean => {
      if (id === undefined || id === null || !me) return false;
      const player = this.game.playerBySmallID(id);
      if (!player || !player.isPlayer()) return false;
      return player.smallID() === me.smallID() || me.isFriendly(player);
    };

    const ranked = [...events]
      .filter((e) => importantOrder[e.activity] !== undefined)
      .sort((a, b) => {
        const scoreA = importantOrder[a.activity] ?? 0;
        const scoreB = importantOrder[b.activity] ?? 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return b.tick - a.tick;
      })
      .map((e) => {
        let scope: ReplayMoment["scope"] = "global";
        if (
          myID !== undefined &&
          (e.sourcePlayerID === myID || e.targetPlayerID === myID)
        ) {
          scope = "personal";
        } else if (isFriendly(e.sourcePlayerID) || isFriendly(e.targetPlayerID)) {
          scope = "team";
        }
        const seconds = Math.max(
          0,
          Math.floor((e.tick - this.game.config().numSpawnPhaseTurns()) / 10),
        );
        const mm = Math.floor(seconds / 60)
          .toString()
          .padStart(2, "0");
        const ss = (seconds % 60).toString().padStart(2, "0");
        return {
          id: `${e.tick}-${e.activity}-${e.label}`,
          label: `[${mm}:${ss}] ${e.label}`,
          tile: e.tile ?? null,
          scope,
          tick: e.tick,
          score: importantOrder[e.activity] ?? 0,
        };
      });

    const personal = ranked
      .filter((m) => m.scope === "personal")
      .sort((a, b) => b.score - a.score || b.tick - a.tick)
      .slice(0, 2);
    const team = ranked
      .filter((m) => m.scope === "team")
      .sort((a, b) => b.score - a.score || b.tick - a.tick)
      .slice(0, 2);
    const global = ranked
      .filter((m) => m.scope === "global")
      .sort((a, b) => b.score - a.score || b.tick - a.tick)
      .slice(0, 1);

    const combined = [...personal, ...team, ...global]
      .filter((value, index, arr) => arr.findIndex((m) => m.id === value.id) === index)
      .sort((a, b) => a.tick - b.tick)
      .slice(0, 5)
      .map((m) => ({
        id: m.id,
        label: m.label,
        tile: m.tile,
        scope: m.scope,
      }));

    return combined;
  }

  private addKpiCounter(key: string, delta: number) {
    const prev = Number(localStorage.getItem(key) ?? "0");
    localStorage.setItem(key, String(prev + delta));
  }

  private recordKpis(myStats: AllPlayersStats[string] | undefined) {
    const vf = myStats?.vaultfront as Record<string, unknown> | undefined;
    const mySmallID = this.game.myPlayer()?.smallID();
    this.addKpiCounter("vaultfront.kpi.matches", 1);
    this.addKpiCounter(
      "vaultfront.kpi.vaultInteractions",
      Number(this.toBigInt(vf?.vaultInteractions)),
    );
    this.addKpiCounter(
      "vaultfront.kpi.convoyIntercepts",
      Number(this.toBigInt(vf?.vaultConvoysIntercepted)),
    );
    const minute8Behind = Number(this.toBigInt(vf?.minute8Behind));
    if (minute8Behind > 0) {
      this.addKpiCounter("vaultfront.kpi.minute8BehindMatches", 1);
      if (this.isWin) {
        this.addKpiCounter("vaultfront.kpi.comebackWinsFromBehind", 1);
      }
    }

    if (mySmallID !== undefined) {
      const raw = sessionStorage.getItem("vaultfront.matchTimeline");
      if (raw) {
        try {
          const events = JSON.parse(raw) as Array<{
            tick: number;
            activity: string;
            sourcePlayerID: number | null;
            targetPlayerID: number | null;
          }>;
          const first = events
            .filter(
              (e) =>
                e.activity === "convoy_intercepted" &&
                (e.sourcePlayerID === mySmallID || e.targetPlayerID === mySmallID),
            )
            .sort((a, b) => a.tick - b.tick)[0];
          if (first) {
            const seconds = Math.max(
              0,
              Math.floor((first.tick - this.game.config().numSpawnPhaseTurns()) / 10),
            );
            this.addKpiCounter("vaultfront.kpi.firstInterceptTimeSum", seconds);
            this.addKpiCounter("vaultfront.kpi.firstInterceptSamples", 1);
          }
        } catch {
          // ignore malformed timeline cache
        }
      }
    }
  }
}
