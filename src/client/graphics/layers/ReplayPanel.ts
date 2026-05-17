import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { GameView } from "../../../core/game/GameView";
import { createCustomClip } from "../../Api";
import { ReplaySpeedChangeEvent } from "../../InputHandler";
import {
  defaultReplaySpeedMultiplier,
  ReplaySpeedMultiplier,
} from "../../utilities/ReplaySpeedMultiplier";
import { translateText } from "../../Utils";
import { Layer } from "./Layer";

export class ShowReplayPanelEvent {
  constructor(
    public visible: boolean = true,
    public isSingleplayer: boolean = false,
  ) {}
}

@customElement("replay-panel")
export class ReplayPanel extends LitElement implements Layer {
  public game: GameView | undefined;
  public eventBus: EventBus | undefined;

  @property({ type: Boolean })
  visible: boolean = false;

  @state()
  private _replaySpeedMultiplier: number = defaultReplaySpeedMultiplier;

  @property({ type: Boolean })
  isSingleplayer = false;

  @state()
  private _clipState: "idle" | "copying" | "copied" | "error" = "idle";

  createRenderRoot() {
    return this; // Enable Tailwind CSS
  }

  init() {
    if (this.eventBus) {
      this.eventBus.on(ShowReplayPanelEvent, (event: ShowReplayPanelEvent) => {
        this.visible = event.visible;
        this.isSingleplayer = event.isSingleplayer;
      });
    }
  }

  getTickIntervalMs() {
    return 1000;
  }

  tick() {
    if (!this.visible) return;
    this.requestUpdate();
  }

  onReplaySpeedChange(value: ReplaySpeedMultiplier) {
    this._replaySpeedMultiplier = value;
    this.eventBus?.emit(new ReplaySpeedChangeEvent(value));
  }

  renderLayer(_ctx: CanvasRenderingContext2D) {}
  shouldTransform() {
    return false;
  }

  private async handleClipThis() {
    if (this._clipState === "copying") return;
    const gameId = this.game?.gameID?.();
    if (!gameId) return;

    const ticksPerSecond = 10;
    const clipHalfSeconds = 15;
    const currentTick = this.game?.ticks() ?? 0;
    const startTick = Math.max(
      0,
      currentTick - clipHalfSeconds * ticksPerSecond,
    );
    const endTick = currentTick + clipHalfSeconds * ticksPerSecond;

    this._clipState = "copying";
    this.requestUpdate();

    const url = await createCustomClip(gameId, startTick, endTick);
    if (!url) {
      this._clipState = "error";
      setTimeout(() => {
        this._clipState = "idle";
        this.requestUpdate();
      }, 2000);
      this.requestUpdate();
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({ title: "VaultFront Clip", url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      this._clipState = "copied";
    } catch {
      this._clipState = "error";
    }
    this.requestUpdate();
    setTimeout(() => {
      this._clipState = "idle";
      this.requestUpdate();
    }, 2500);
  }

  render() {
    if (!this.visible) return html``;

    const clipLabel =
      this._clipState === "copying"
        ? "Clipping…"
        : this._clipState === "copied"
          ? "Clip copied!"
          : this._clipState === "error"
            ? "Clip failed"
            : "📎 Clip This";

    return html`
      <div
        class="p-2 bg-gray-800/70 backdrop-blur-xs shadow-xs min-[1200px]:rounded-lg rounded-l-lg"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        <label class="block mb-2 text-white" translate="no">
          ${this.game?.config()?.isReplay()
            ? translateText("replay_panel.replay_speed")
            : translateText("replay_panel.game_speed")}
        </label>
        <div class="grid grid-cols-4 gap-2">
          ${this.renderSpeedButton(ReplaySpeedMultiplier.slow, "×0.5")}
          ${this.renderSpeedButton(ReplaySpeedMultiplier.normal, "×1")}
          ${this.renderSpeedButton(ReplaySpeedMultiplier.fast, "×2")}
          ${this.renderSpeedButton(
            ReplaySpeedMultiplier.fastest,
            translateText("replay_panel.fastest_game_speed"),
          )}
        </div>
        ${this.game?.config()?.isReplay()
          ? html`
              <button
                class="mt-2 w-full py-1 px-2 text-xs text-indigo-200 bg-indigo-600/40 border border-indigo-500/50 rounded-sm cursor-pointer hover:bg-indigo-600/60 transition-colors"
                @click=${this.handleClipThis}
                ?disabled=${this._clipState === "copying"}
              >
                ${clipLabel}
              </button>
            `
          : null}
      </div>
    `;
  }

  private renderSpeedButton(value: ReplaySpeedMultiplier, label: string) {
    const backgroundColor =
      this._replaySpeedMultiplier === value ? "bg-blue-400" : "";

    return html`
      <button
        class="py-0.5 px-1 text-sm text-white rounded-sm border transition border-gray-500 ${backgroundColor} hover:border-gray-200"
        @click=${() => this.onReplaySpeedChange(value)}
      >
        ${label}
      </button>
    `;
  }
}
