export type VaultFrontPulseSurface =
  | "tutorial"
  | "match"
  | "tournament"
  | "retention";

export interface VaultFrontPlaytestPulseEvent {
  surface: VaultFrontPulseSurface;
  event: string;
  value?: number;
  at?: number;
}

export interface VaultFrontPlaytestPulseSummary {
  generatedAt: string;
  status: "no-signal" | "warming" | "ready";
  score: number;
  totals: {
    events: number;
    tutorialShown: number;
    tutorialAdvanced: number;
    tutorialCompleted: number;
    tutorialSkipped: number;
    matchFeedback: number;
    tournamentActions: number;
    retentionSignals: number;
    retentionChallengeShown: number;
    retentionGoalSaved: number;
    retentionRequeued: number;
    retentionRematchRequested: number;
  };
  rates: {
    tutorialAdvance: number;
    tutorialCompletion: number;
    tutorialSkip: number;
    matchFeedback: number;
    retentionAction: number;
  };
  freshness: {
    firstEventAt: string | null;
    lastEventAt: string | null;
    ageMinutes: number | null;
  };
  recent: VaultFrontPlaytestPulseEvent[];
  insights: string[];
  actionInsights: string[];
  operatorNext: {
    headline: string;
    steps: string[];
    successMetric: string;
  };
}

const MAX_RECENT = 40;

const pulse = {
  events: 0,
  tutorialShown: 0,
  tutorialAdvanced: 0,
  tutorialCompleted: 0,
  tutorialSkipped: 0,
  matchFeedback: 0,
  tournamentActions: 0,
  retentionSignals: 0,
  retentionChallengeShown: 0,
  retentionGoalSaved: 0,
  retentionRequeued: 0,
  retentionRematchRequested: 0,
  firstEventAt: null as number | null,
  lastEventAt: null as number | null,
  recent: [] as VaultFrontPlaytestPulseEvent[],
};

export function resetVaultFrontPlaytestPulseForTests(): void {
  pulse.events = 0;
  pulse.tutorialShown = 0;
  pulse.tutorialAdvanced = 0;
  pulse.tutorialCompleted = 0;
  pulse.tutorialSkipped = 0;
  pulse.matchFeedback = 0;
  pulse.tournamentActions = 0;
  pulse.retentionSignals = 0;
  pulse.retentionChallengeShown = 0;
  pulse.retentionGoalSaved = 0;
  pulse.retentionRequeued = 0;
  pulse.retentionRematchRequested = 0;
  pulse.firstEventAt = null;
  pulse.lastEventAt = null;
  pulse.recent = [];
}

export function recordVaultFrontPlaytestPulse(
  input: VaultFrontPlaytestPulseEvent,
): VaultFrontPlaytestPulseSummary {
  const value = Math.max(1, Math.min(10_000, input.value ?? 1));
  const at = input.at ?? Date.now();
  const event = { ...input, value, at };

  pulse.events += value;
  pulse.firstEventAt ??= at;
  pulse.lastEventAt = at;

  if (event.surface === "tutorial") {
    if (event.event === "shown") pulse.tutorialShown += value;
    if (event.event === "advance") pulse.tutorialAdvanced += value;
    if (event.event === "complete") pulse.tutorialCompleted += value;
    if (event.event === "skip") pulse.tutorialSkipped += value;
  } else if (event.surface === "match") {
    pulse.matchFeedback += value;
  } else if (event.surface === "tournament") {
    pulse.tournamentActions += value;
  } else if (event.surface === "retention") {
    pulse.retentionSignals += value;
    if (event.event === "rival_challenge_shown") {
      pulse.retentionChallengeShown += value;
    }
    if (event.event === "rival_goal_saved") {
      pulse.retentionGoalSaved += value;
    }
    if (event.event === "rival_requeue_clicked") {
      pulse.retentionRequeued += value;
    }
    if (event.event === "rival_rematch_requested") {
      pulse.retentionRematchRequested += value;
    }
  }

  pulse.recent.unshift(event);
  pulse.recent = pulse.recent.slice(0, MAX_RECENT);
  return buildVaultFrontPlaytestPulseSummary();
}

export function buildVaultFrontPlaytestPulseSummary(
  now = Date.now(),
): VaultFrontPlaytestPulseSummary {
  const tutorialCompletion =
    pulse.tutorialShown > 0
      ? Number((pulse.tutorialCompleted / pulse.tutorialShown).toFixed(4))
      : 0;
  const tutorialAdvance =
    pulse.tutorialShown > 0
      ? Number((pulse.tutorialAdvanced / pulse.tutorialShown).toFixed(4))
      : 0;
  const tutorialSkip =
    pulse.tutorialShown > 0
      ? Number((pulse.tutorialSkipped / pulse.tutorialShown).toFixed(4))
      : 0;
  const matchFeedback =
    pulse.events > 0
      ? Number((pulse.matchFeedback / pulse.events).toFixed(4))
      : 0;
  const retentionActions =
    pulse.retentionGoalSaved +
    pulse.retentionRequeued +
    pulse.retentionRematchRequested;
  const retentionAction =
    pulse.retentionChallengeShown > 0
      ? Number((retentionActions / pulse.retentionChallengeShown).toFixed(4))
      : 0;
  const ageMinutes =
    pulse.lastEventAt === null
      ? null
      : Number(((now - pulse.lastEventAt) / 60_000).toFixed(1));
  const score = Math.min(
    100,
    Math.round(
      pulse.tutorialCompleted * 12 +
        pulse.matchFeedback * 8 +
        pulse.tournamentActions * 10 +
        pulse.retentionSignals * 6,
    ),
  );
  const status =
    pulse.events === 0 ? "no-signal" : score >= 35 ? "ready" : "warming";

  const actionInsights = buildActionInsights({
    tutorialAdvance,
    tutorialCompletion,
    tutorialSkip,
    matchFeedback,
    retentionAction,
    ageMinutes,
  });

  return {
    generatedAt: new Date(now).toISOString(),
    status,
    score,
    totals: {
      events: pulse.events,
      tutorialShown: pulse.tutorialShown,
      tutorialAdvanced: pulse.tutorialAdvanced,
      tutorialCompleted: pulse.tutorialCompleted,
      tutorialSkipped: pulse.tutorialSkipped,
      matchFeedback: pulse.matchFeedback,
      tournamentActions: pulse.tournamentActions,
      retentionSignals: pulse.retentionSignals,
      retentionChallengeShown: pulse.retentionChallengeShown,
      retentionGoalSaved: pulse.retentionGoalSaved,
      retentionRequeued: pulse.retentionRequeued,
      retentionRematchRequested: pulse.retentionRematchRequested,
    },
    rates: {
      tutorialAdvance,
      tutorialCompletion,
      tutorialSkip,
      matchFeedback,
      retentionAction,
    },
    freshness: {
      firstEventAt:
        pulse.firstEventAt === null
          ? null
          : new Date(pulse.firstEventAt).toISOString(),
      lastEventAt:
        pulse.lastEventAt === null
          ? null
          : new Date(pulse.lastEventAt).toISOString(),
      ageMinutes,
    },
    recent: pulse.recent.slice(0, 10),
    insights: buildPulseInsights(tutorialCompletion, tutorialSkip, ageMinutes),
    actionInsights,
    operatorNext: buildOperatorNext({
      tutorialAdvance,
      tutorialCompletion,
      tutorialSkip,
      matchFeedback,
      retentionAction,
      ageMinutes,
      actionInsights,
    }),
  };
}

function buildPulseInsights(
  tutorialCompletion: number,
  tutorialSkip: number,
  ageMinutes: number | null,
): string[] {
  const insights: string[] = [];
  if (pulse.events === 0) {
    insights.push("No playtest pulse events have landed in this process yet.");
  }
  if (pulse.tutorialShown > 0) {
    insights.push(
      `Tutorial completion is ${Math.round(tutorialCompletion * 100)}% with ${Math.round(tutorialSkip * 100)}% skips.`,
    );
  }
  if (pulse.matchFeedback > 0) {
    insights.push(
      `${pulse.matchFeedback} post-match feedback signal(s) recorded.`,
    );
  }
  if (pulse.tournamentActions > 0) {
    insights.push(
      `${pulse.tournamentActions} tournament operator action(s) recorded.`,
    );
  }
  if (ageMinutes !== null && ageMinutes > 1440) {
    insights.push("Latest playtest signal is older than 24 hours.");
  }
  return insights;
}

function buildActionInsights(input: {
  tutorialAdvance: number;
  tutorialCompletion: number;
  tutorialSkip: number;
  matchFeedback: number;
  retentionAction: number;
  ageMinutes: number | null;
}): string[] {
  if (pulse.events === 0) {
    return [
      "Run one guided internal match and confirm tutorial, match feedback, and post-match retention events land.",
    ];
  }

  const actions: string[] = [];
  if (input.ageMinutes !== null && input.ageMinutes > 1440) {
    actions.push(
      "Refresh playtest evidence; latest pulse is older than 24 hours.",
    );
  }
  if (pulse.tutorialShown > 0 && input.tutorialAdvance < 0.5) {
    actions.push(
      "Tutorial advances are weak; tighten the first strip copy or make the next action more obvious.",
    );
  }
  if (pulse.tutorialShown > 0 && input.tutorialCompletion < 0.35) {
    actions.push(
      "Tutorial completion is below launch confidence; shorten or split the onboarding flow before public traffic.",
    );
  }
  if (pulse.matchFeedback === 0) {
    actions.push(
      "No post-match feedback has landed; verify the win modal is reached during the next playtest.",
    );
  }
  if (pulse.retentionChallengeShown > 0 && input.retentionAction < 0.25) {
    actions.push(
      "Rival Challenge is visible but not converting; make rematch/requeue the primary rival action.",
    );
  }
  if (pulse.retentionChallengeShown === 0 && pulse.events >= 10) {
    actions.push(
      "Pulse has activity but no rivalry challenge exposure; seed a rivalry scenario in the next internal match.",
    );
  }
  if (actions.length === 0) {
    actions.push(
      "Pulse is broad enough for this alpha gate; continue with a focused rivalry/rematch playtest.",
    );
  }
  return actions.slice(0, 3);
}

function buildOperatorNext(input: {
  tutorialAdvance: number;
  tutorialCompletion: number;
  tutorialSkip: number;
  matchFeedback: number;
  retentionAction: number;
  ageMinutes: number | null;
  actionInsights: string[];
}): VaultFrontPlaytestPulseSummary["operatorNext"] {
  if (pulse.events === 0) {
    return {
      headline: "Run a guided first-match alpha pass.",
      steps: [
        "Start one fresh-player match on a compact viewport and confirm the tutorial strip appears.",
        "Finish the match, submit one post-match feedback choice, and open the KPI panel.",
        "Check readiness again and confirm pulse status moved away from no-signal.",
      ],
      successMetric:
        "Pulse records tutorialShown, tutorialAdvanced, tutorialCompleted, and matchFeedback above zero.",
    };
  }

  if (pulse.tutorialShown > 0 && input.tutorialCompletion < 0.35) {
    return {
      headline: "Replay onboarding until the first action is obvious.",
      steps: [
        "Run two first-time matches and ask each tester to advance the tutorial without coaching.",
        "Stop when a tester hesitates on the first strip and rewrite that step in-place.",
        "Recheck pulse action insights before moving to rivalry validation.",
      ],
      successMetric:
        "Tutorial completion reaches 35%+ with tutorialAdvance at 50%+ in the next pulse sample.",
    };
  }

  if (pulse.matchFeedback === 0) {
    return {
      headline: "Force a post-match feedback check.",
      steps: [
        "Play or spectate through a full win modal and click one feedback option.",
        "Verify the KPI panel shows at least one match feedback signal.",
        "Only then judge Rival Challenge behavior, because the post-match surface is proven reachable.",
      ],
      successMetric:
        "matchFeedback is greater than zero and readiness no longer names feedback as the next action.",
    };
  }

  if (pulse.retentionChallengeShown > 0 && input.retentionAction < 0.25) {
    return {
      headline: "Make the Rival Challenge action unmissable.",
      steps: [
        "Seed rivalry revenge progress, reach the win modal, and observe the first action testers choose.",
        "Run one pass with goal-save as the primary ask and one pass with requeue/rematch as the primary ask.",
        "Keep the variant that raises Rival Challenge action rate without reducing match feedback.",
      ],
      successMetric:
        "Rival Challenge action rate reaches 25%+ across goal-save, requeue, and rematch events.",
    };
  }

  if (pulse.retentionChallengeShown === 0 && pulse.events >= 10) {
    return {
      headline: "Seed a rivalry rematch scenario.",
      steps: [
        "Create a match where the same opponent blocks or defeats the player twice.",
        "Earn rivalry revenge progress and confirm the win modal shows Rival Challenge.",
        "Click requeue or rematch from that card, then inspect retention counters.",
      ],
      successMetric:
        "retentionChallengeShown and at least one Rival Challenge action counter are both above zero.",
    };
  }

  return {
    headline: "Run the focused rivalry/rematch alpha gate.",
    steps: [
      "Run one guided rivalry scenario from first tutorial touch through win modal.",
      "Confirm tutorial, feedback, and Rival Challenge counters all move in the same process.",
      "Use readiness action insight as the pass/fail note for the next launch checkpoint.",
    ],
    successMetric:
      input.actionInsights[0] ??
      "Pulse stays ready with tutorial, feedback, and retention signals present.",
  };
}
