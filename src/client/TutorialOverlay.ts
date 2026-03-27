/**
 * TutorialOverlay — in-game step-by-step tutorial carousel.
 *
 * Renders a bottom-left panel showing:
 *   - Current step number and title
 *   - Objective text
 *   - Contextual hint (expandable)
 *   - Progress dots (one per step)
 *   - Skip button (hides overlay for the session)
 *
 * Usage:
 *   Add <vault-tutorial-overlay> to the game root.
 *   Call overlay.setPlayerId(persistentId) once the player is known.
 *   Call overlay.notifyEvent(eventType) from the game loop when vault events fire.
 */

import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getApiBase } from "./Api";

interface TutorialState {
  persistentId: string;
  currentStep: string;
  completedSteps: string[];
  startedAt: number;
  completedAt?: number;
}

interface TutorialStep {
  id: string;
  title: string;
  objective: string;
  hint: string;
  completionEvent: string;
  order: number;
}

const STEP_ORDER = [
  "vault_intro",
  "convoy_intro",
  "chain_intro",
  "surge_intro",
  "squad_intro",
];

@customElement("vault-tutorial-overlay")
export class TutorialOverlay extends LitElement {
  @state() private visible = false;
  @state() private dismissed = false;
  @state() private showHint = false;
  @state() private stepCompleted = false;
  @state() private state: TutorialState | null = null;
  @state() private steps: TutorialStep[] = [];

  private persistentId = "";

  createRenderRoot() {
    return this;
  }

  async setPlayerId(persistentId: string): Promise<void> {
    this.persistentId = persistentId;
    await this.loadState();
    await this.loadSteps();
    if (this.state && this.state.currentStep !== "complete") {
      this.visible = true;
    }
  }

  /** Called by the game loop when a vault event fires. */
  async notifyEvent(eventType: string): Promise<void> {
    if (!this.persistentId || !this.state) return;
    const current = this.getCurrentStep();
    if (!current || current.completionEvent !== eventType) return;

    this.stepCompleted = true;
    setTimeout(async () => {
      await this.advanceStep(current.id);
      this.stepCompleted = false;
    }, 1500);
  }

  private async loadState(): Promise<void> {
    try {
      const res = await fetch(
        `${getApiBase()}/api/tutorial/state/${encodeURIComponent(this.persistentId)}`,
      );
      if (res.ok) this.state = (await res.json()) as TutorialState;
    } catch {
      // non-fatal
    }
  }

  private async loadSteps(): Promise<void> {
    // Steps are static; in a production build they'd come from a dedicated endpoint.
    // For now, inline the canonical step order.
    this.steps = STEP_ORDER.map((id, i) => ({
      id,
      title: this.stepTitle(id),
      objective: this.stepObjective(id),
      hint: this.stepHint(id),
      completionEvent: this.stepEvent(id),
      order: i + 1,
    }));
  }

  private async advanceStep(stepId: string): Promise<void> {
    try {
      const res = await fetch(`${getApiBase()}/api/tutorial/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persistentId: this.persistentId, step: stepId }),
      });
      if (res.ok) {
        this.state = (await res.json()) as TutorialState;
        if (this.state.currentStep === "complete") {
          setTimeout(() => {
            this.visible = false;
          }, 2000);
        }
      }
    } catch {
      // non-fatal
    }
  }

  private getCurrentStep(): TutorialStep | null {
    if (!this.state || this.state.currentStep === "complete") return null;
    return this.steps.find((s) => s.id === this.state!.currentStep) ?? null;
  }

  render() {
    if (!this.visible || this.dismissed) return nothing;
    const current = this.getCurrentStep();
    if (!current) return nothing;

    const completedCount = this.state?.completedSteps.length ?? 0;
    const totalSteps = STEP_ORDER.length;
    const progress = Math.round((completedCount / totalSteps) * 100);

    return html`
      <div
        class="fixed bottom-20 left-4 z-50 w-72 bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-2xl border border-yellow-500/30 text-white text-sm"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between px-3 pt-3 pb-1 border-b border-gray-700/50"
        >
          <span
            class="text-yellow-400 font-semibold text-xs uppercase tracking-wide"
          >
            Tutorial · Step ${completedCount + 1}/${totalSteps}
          </span>
          <button
            @click=${() => {
              this.dismissed = true;
            }}
            class="text-gray-400 hover:text-white text-xs px-1 cursor-pointer bg-transparent border-0"
            title="Skip tutorial"
          >
            ✕ Skip
          </button>
        </div>

        <!-- Step content -->
        <div class="px-3 py-2">
          <p class="font-bold text-white mb-1">
            ${this.stepCompleted ? "✓ Complete!" : current.title}
          </p>
          <p class="text-gray-300 leading-snug">${current.objective}</p>

          <!-- Hint toggle -->
          <button
            @click=${() => {
              this.showHint = !this.showHint;
            }}
            class="mt-2 text-xs text-yellow-400/80 hover:text-yellow-400 cursor-pointer bg-transparent border-0 p-0"
          >
            ${this.showHint ? "▲ Hide hint" : "▼ Show hint"}
          </button>
          ${this.showHint
            ? html`<p class="mt-1 text-gray-400 italic text-xs leading-snug">
                ${current.hint}
              </p>`
            : nothing}
        </div>

        <!-- Progress bar -->
        <div class="px-3 pb-3">
          <div class="w-full bg-gray-700 rounded-full h-1.5">
            <div
              class="bg-yellow-400 h-1.5 rounded-full transition-all duration-500"
              style="width: ${progress}%"
            ></div>
          </div>
          <!-- Step dots -->
          <div class="flex gap-1 mt-1.5 justify-center">
            ${STEP_ORDER.map(
              (stepId) => html`
                <span
                  class="w-1.5 h-1.5 rounded-full ${this.state?.completedSteps.includes(
                    stepId,
                  )
                    ? "bg-yellow-400"
                    : stepId === this.state?.currentStep
                      ? "bg-yellow-400/50"
                      : "bg-gray-600"}"
                ></span>
              `,
            )}
          </div>
        </div>
      </div>
    `;
  }

  // Step metadata (matches TutorialOrchestrator on the server)
  private stepTitle(id: string): string {
    const titles: Record<string, string> = {
      vault_intro: "Capture a Vault Site",
      convoy_intro: "Send a Convoy",
      chain_intro: "Complete an Execution Chain",
      surge_intro: "Activate a Surge",
      squad_intro: "Complete a Squad Objective",
    };
    return titles[id] ?? id;
  }

  private stepObjective(id: string): string {
    const objectives: Record<string, string> = {
      vault_intro:
        "Move troops into a vault site hex to begin capturing it. Hold it until the capture bar fills.",
      convoy_intro:
        "After capturing a vault, route a convoy to deliver resources to a friendly stronghold.",
      chain_intro:
        "Eliminate 3 enemy units in quick succession to trigger an execution chain combo.",
      surge_intro:
        "Fall below the comeback threshold, then fight back to trigger a power surge.",
      squad_intro:
        "Coordinate with 4 allies to capture the same tower within the squad objective window.",
    };
    return objectives[id] ?? "";
  }

  private stepHint(id: string): string {
    const hints: Record<string, string> = {
      vault_intro:
        "Look for the golden vault icons on the map. Move adjacent and capture starts automatically.",
      convoy_intro:
        "Click your vault, then 'Send Convoy'. Choose a destination stronghold on the route panel.",
      chain_intro:
        "Move your strongest force through a contested zone. Each kill within 5 seconds extends the chain.",
      surge_intro:
        "If you're losing territory, don't give up — surge activates when you start recovering.",
      squad_intro:
        "Watch for the squad objective ring around special towers. Use the role-ping button to rally allies.",
    };
    return hints[id] ?? "";
  }

  private stepEvent(id: string): string {
    const events: Record<string, string> = {
      vault_intro: "vault_captured",
      convoy_intro: "convoy_delivered",
      chain_intro: "execution_chain_completed",
      surge_intro: "surge_activated",
      squad_intro: "squad_objective_completed",
    };
    return events[id] ?? "";
  }
}
