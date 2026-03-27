/**
 * TutorialOrchestrator — tracks per-player tutorial step progress.
 *
 * Tutorial consists of 5 sequential steps. Each step has an ID, display title,
 * objective description, the game event that marks it complete, and a
 * time-based fallback hint trigger (seconds after step becomes active).
 *
 * State is in-memory. A future iteration can persist to player_stats or a
 * dedicated tutorial_progress table.
 */

export type TutorialStepId =
  | "vault_intro"
  | "convoy_intro"
  | "chain_intro"
  | "surge_intro"
  | "squad_intro";

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  objective: string;
  hint: string;
  completionEvent: string;
  order: number;
}

export interface TutorialState {
  persistentId: string;
  currentStep: TutorialStepId | "complete";
  completedSteps: TutorialStepId[];
  startedAt: number;
  completedAt?: number;
}

const STEPS: TutorialStep[] = [
  {
    id: "vault_intro",
    title: "Capture a Vault Site",
    objective:
      "Move your troops into a vault site hex to begin capturing it. Hold it until the capture bar fills.",
    hint: "Look for the golden vault icons on the map. Move adjacent and the capture starts automatically.",
    completionEvent: "vault_captured",
    order: 1,
  },
  {
    id: "convoy_intro",
    title: "Send a Convoy",
    objective:
      "After capturing a vault, route a convoy to deliver resources to a friendly stronghold.",
    hint: "Click your vault, then click 'Send Convoy'. Choose a destination stronghold on the route panel.",
    completionEvent: "convoy_delivered",
    order: 2,
  },
  {
    id: "chain_intro",
    title: "Complete an Execution Chain",
    objective:
      "Eliminate 3 enemy units in quick succession to trigger an execution chain combo.",
    hint: "Move your strongest force through a contested zone. Each kill within 5 seconds extends the chain.",
    completionEvent: "execution_chain_completed",
    order: 3,
  },
  {
    id: "surge_intro",
    title: "Activate a Surge",
    objective:
      "Fall below the comeback threshold, then fight back to trigger a temporary power surge.",
    hint: "If you're losing territory, don't give up — the surge activates automatically when you start recovering.",
    completionEvent: "surge_activated",
    order: 4,
  },
  {
    id: "squad_intro",
    title: "Complete a Squad Objective",
    objective:
      "Coordinate with 4 other players to capture the same tower within the squad objective window.",
    hint: "Watch for the squad objective ring around special towers. Ping your allies with the role-ping button.",
    completionEvent: "squad_objective_completed",
    order: 5,
  },
];

const STEPS_BY_ID = new Map<TutorialStepId, TutorialStep>(
  STEPS.map((s) => [s.id, s]),
);

const STEP_ORDER: TutorialStepId[] = STEPS.sort(
  (a, b) => a.order - b.order,
).map((s) => s.id);

class TutorialOrchestrator {
  private progress = new Map<string, TutorialState>();

  getSteps(): TutorialStep[] {
    return STEPS;
  }

  getState(persistentId: string): TutorialState {
    return (
      this.progress.get(persistentId) ?? this.createInitialState(persistentId)
    );
  }

  completeStep(persistentId: string, stepId: string): TutorialState {
    const state = this.getState(persistentId);
    if (state.currentStep === "complete") return state;
    if (state.currentStep !== stepId) return state;

    const updatedCompleted = [
      ...state.completedSteps,
      stepId as TutorialStepId,
    ];
    const nextIdx = STEP_ORDER.indexOf(stepId as TutorialStepId) + 1;
    const nextStep: TutorialStepId | "complete" =
      nextIdx < STEP_ORDER.length ? STEP_ORDER[nextIdx] : "complete";

    const updated: TutorialState = {
      ...state,
      completedSteps: updatedCompleted,
      currentStep: nextStep,
      completedAt: nextStep === "complete" ? Date.now() : undefined,
    };
    this.progress.set(persistentId, updated);
    return updated;
  }

  resetProgress(persistentId: string): void {
    this.progress.delete(persistentId);
  }

  /** Called by GameServer when a vault event fires. Auto-advances tutorial if applicable. */
  handleGameEvent(
    persistentId: string,
    eventType: string,
  ): TutorialState | null {
    const state = this.progress.get(persistentId);
    if (!state || state.currentStep === "complete") return null;

    const current = STEPS_BY_ID.get(state.currentStep as TutorialStepId);
    if (current && current.completionEvent === eventType) {
      return this.completeStep(persistentId, state.currentStep);
    }
    return null;
  }

  private createInitialState(persistentId: string): TutorialState {
    const state: TutorialState = {
      persistentId,
      currentStep: STEP_ORDER[0],
      completedSteps: [],
      startedAt: Date.now(),
    };
    this.progress.set(persistentId, state);
    return state;
  }
}

export const tutorialOrchestrator = new TutorialOrchestrator();
