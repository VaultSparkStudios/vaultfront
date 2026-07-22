import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameUpdateType } from "../../core/game/GameUpdates";
import { GameView } from "../../core/game/GameView";
import {
  fetchAchievements,
  fetchSeasonProgress,
  fetchVaultFrontContracts,
} from "../Api";
import { getPersistentID } from "../Auth";
import {
  persistConvoyMastery,
  readConvoyMastery,
  selectConvoyMastery,
} from "../ConvoyMastery";
import type { Layer } from "../graphics/layers/Layer";

@customElement("progression-debrief")
export class ProgressionDebrief extends LitElement implements Layer {
  public game: GameView;

  @state() private visible = false;
  @state() private loading = false;
  @state() private eloText = "";
  @state() private milestoneText = "";
  @state() private achievementText = "";
  @state() private masteryText = "";
  @state() private masteryEvidence = "";

  private requested = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() {
    return this;
  }

  tick(): void {
    if (this.requested || !this.game) return;
    const wins = this.game.updatesSinceLastTick()?.[GameUpdateType.Win];
    if (!wins || wins.length === 0) return;
    this.requested = true;
    this.visible = true;
    this.loading = true;
    // The server accepts the winner envelope first; this bounded delay lets
    // the idempotent progression fan-out settle before the debrief reads it.
    this.refreshTimer = setTimeout(() => void this.refreshProgression(), 600);
  }

  async refreshProgression(): Promise<void> {
    const persistentId = getPersistentID();
    const [contracts, season, achievements] = await Promise.all([
      fetchVaultFrontContracts(),
      fetchSeasonProgress(persistentId),
      fetchAchievements(persistentId),
    ]);

    if (contracts) {
      this.eloText =
        contracts.eloLabel +
        " " +
        contracts.eloRating +
        " · " +
        contracts.matchesPlayed +
        " matches";
    }
    const nextMilestone = season?.milestones
      .filter((entry) => !entry.claimed)
      .sort((a, b) => b.pct - a.pct)[0];
    if (nextMilestone) {
      this.milestoneText =
        nextMilestone.milestone.title +
        " " +
        nextMilestone.progress +
        "/" +
        nextMilestone.target;
    }
    const unlocked = achievements?.achievements.filter(
      (entry) => entry.unlockedAt !== null,
    ).length;
    if (unlocked !== undefined) {
      this.achievementText =
        unlocked + "/" + achievements!.achievements.length + " achievements";
    }
    const saved = readConvoyMastery();
    const mastery = selectConvoyMastery({
      savedGoal: saved ? { text: saved.text, goalKey: saved.goalKey } : null,
      milestones: season?.milestones,
      achievements: achievements?.achievements,
      contracts,
    });
    persistConvoyMastery(mastery);
    this.masteryText = mastery.text;
    this.masteryEvidence = mastery.evidence;
    this.loading = false;
  }

  private dismiss(): void {
    this.visible = false;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
  }

  render() {
    if (!this.visible) return html``;
    return html`
      <aside
        class="fixed bottom-4 left-1/2 z-[9600] w-[min(92vw,420px)] -translate-x-1/2 rounded-lg border border-amber-300/45 bg-slate-950/95 p-3 text-slate-100 shadow-2xl"
        aria-label="Progression Debrief"
      >
        <div class="flex items-center justify-between gap-3">
          <div
            class="text-xs font-bold uppercase tracking-[0.14em] text-amber-300"
          >
            Progression Debrief
          </div>
          <button
            class="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
            @click=${this.dismiss}
            aria-label="Dismiss progression debrief"
          >
            ✕
          </button>
        </div>
        ${
          this.loading
            ? html`<div class="mt-2 text-sm text-slate-300">
                Finalizing match rewards…
              </div>`
            : html`<div class="mt-2">
                <div
                  class="rounded border border-cyan-300/30 bg-cyan-950/25 p-2"
                >
                  <div
                    class="text-xs font-bold uppercase tracking-wide text-cyan-200"
                  >
                    Convoy Mastery
                  </div>
                  <div class="mt-1 text-sm font-semibold text-white">
                    ${this.masteryText}
                  </div>
                  <div class="mt-0.5 text-xs text-cyan-100/75">
                    ${this.masteryEvidence}
                  </div>
                </div>
                <div
                  class="mt-2 grid gap-1 text-xs text-slate-300 sm:grid-cols-3"
                >
                  <div>${this.eloText || "Rating unchanged"}</div>
                  <div>${this.milestoneText || "Season track ready"}</div>
                  <div>${this.achievementText || "Achievements ready"}</div>
                </div>
              </div>`
        }
      </aside>
    `;
  }
}
