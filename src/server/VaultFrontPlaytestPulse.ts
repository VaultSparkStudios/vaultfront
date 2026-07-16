export type VaultFrontPulseSurface =
  "tutorial" | "match" | "tournament" | "retention";

export type VaultFrontEvidenceSource = "human" | "agent" | "test" | "system";

export interface VaultFrontPlaytestPulseEvent {
  surface: VaultFrontPulseSurface;
  event: string;
  /** Evidence is always unit-weighted. Caller-selected weights are rejected. */
  value?: 1;
  at?: number;
  evidenceSessionId?: string;
  eventId?: string;
  source?: VaultFrontEvidenceSource;
  /** Server-derived pseudonymous key. Never send a raw account identifier. */
  actorKey?: string;
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
  recent: Array<Omit<VaultFrontPlaytestPulseEvent, "actorKey">>;
  evidence: {
    acceptedHumanEvents: number;
    uniqueHumanSessions: number;
    uniqueHumanActors: number;
    duplicateEvents: number;
    rejectedEvents: number;
    excludedBySource: Record<
      Exclude<VaultFrontEvidenceSource, "human">,
      number
    >;
  };
  insights: string[];
  actionInsights: string[];
  operatorNext: {
    headline: string;
    steps: string[];
    successMetric: string;
  };
  alphaGate: {
    status: "not-started" | "warming" | "blocked" | "ready";
    checks: {
      fresh: boolean;
      sampleSize: boolean;
      tutorial: boolean;
      feedback: boolean;
      rivalExposure: boolean;
      rivalAction: boolean;
    };
    passLabel: string;
    nextCheck: string;
  };
}

const MAX_RECENT = 40;
const allowedEvents: Record<VaultFrontPulseSurface, ReadonlySet<string>> = {
  tutorial: new Set(["shown", "advance", "complete", "skip"]),
  match: new Set([
    "feedback",
    "feedback_epic",
    "feedback_balanced",
    "feedback_off",
  ]),
  tournament: new Set(["seed_bracket", "report_winner"]),
  retention: new Set([
    "funnel_win",
    "funnel_loss",
    "rival_challenge_shown",
    "rival_goal_saved",
    "rival_requeue_clicked",
    "rival_rematch_requested",
  ]),
};

const seenEventIds = new Set<string>();
const seenEventOrder: string[] = [];
const humanSessionActors = new Map<string, string>();
const sessionEvents = new Map<string, Set<string>>();
let duplicateEvents = 0;
let rejectedEvents = 0;
let legacyEventSequence = 0;
const excludedBySource: Record<
  Exclude<VaultFrontEvidenceSource, "human">,
  number
> = {
  agent: 0,
  test: 0,
  system: 0,
};

function sessionsWith(
  surface: VaultFrontPulseSurface,
  ...events: string[]
): number {
  let count = 0;
  for (const keys of sessionEvents.values()) {
    if (events.some((event) => keys.has(`${surface}:${event}`))) count += 1;
  }
  return count;
}

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
  recent: [] as Array<Omit<VaultFrontPlaytestPulseEvent, "actorKey">>,
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
  seenEventIds.clear();
  seenEventOrder.length = 0;
  humanSessionActors.clear();
  sessionEvents.clear();
  duplicateEvents = 0;
  rejectedEvents = 0;
  legacyEventSequence = 0;
  excludedBySource.agent = 0;
  excludedBySource.test = 0;
  excludedBySource.system = 0;
}

export function recordVaultFrontPlaytestPulse(
  input: VaultFrontPlaytestPulseEvent,
): VaultFrontPlaytestPulseSummary {
  const source = input.source ?? "system";
  const value = input.value ?? 1;
  const at = input.at ?? Date.now();
  const eventId =
    input.eventId ?? `legacy:${source}:${at}:${legacyEventSequence++}`;
  const evidenceSessionId =
    input.evidenceSessionId ?? `legacy:${source}:${eventId}`;

  if (!allowedEvents[input.surface].has(input.event) || value !== 1) {
    rejectedEvents += 1;
    return buildVaultFrontPlaytestPulseSummary(at);
  }
  if (seenEventIds.has(eventId)) {
    duplicateEvents += 1;
    return buildVaultFrontPlaytestPulseSummary(at);
  }
  seenEventIds.add(eventId);
  seenEventOrder.push(eventId);
  if (seenEventOrder.length > 20_000) {
    const oldest = seenEventOrder.shift();
    if (oldest) seenEventIds.delete(oldest);
  }

  const publicEvent: Omit<VaultFrontPlaytestPulseEvent, "actorKey"> = {
    surface: input.surface,
    event: input.event,
    value: 1,
    at,
    evidenceSessionId,
    eventId,
    source,
  };
  pulse.recent.unshift(publicEvent);
  pulse.recent = pulse.recent.slice(0, MAX_RECENT);

  // Only authenticated, server-pseudonymized human evidence contributes to
  // launch gates. Agent, test, and system samples remain visible but excluded.
  if (source !== "human") {
    excludedBySource[source] += 1;
    return buildVaultFrontPlaytestPulseSummary(at);
  }
  if (!input.actorKey) {
    rejectedEvents += 1;
    return buildVaultFrontPlaytestPulseSummary(at);
  }
  const sessionActor = humanSessionActors.get(evidenceSessionId);
  if (sessionActor && sessionActor !== input.actorKey) {
    rejectedEvents += 1;
    return buildVaultFrontPlaytestPulseSummary(at);
  }
  humanSessionActors.set(evidenceSessionId, input.actorKey);
  const evidence = sessionEvents.get(evidenceSessionId) ?? new Set<string>();
  evidence.add(`${input.surface}:${input.event}`);
  sessionEvents.set(evidenceSessionId, evidence);

  pulse.events += 1;
  pulse.firstEventAt ??= at;
  pulse.lastEventAt = at;

  if (input.surface === "tutorial") {
    if (input.event === "shown") pulse.tutorialShown += 1;
    if (input.event === "advance") pulse.tutorialAdvanced += 1;
    if (input.event === "complete") pulse.tutorialCompleted += 1;
    if (input.event === "skip") pulse.tutorialSkipped += 1;
  } else if (input.surface === "match") {
    pulse.matchFeedback += 1;
  } else if (input.surface === "tournament") {
    pulse.tournamentActions += 1;
  } else if (input.surface === "retention") {
    pulse.retentionSignals += 1;
    if (input.event === "rival_challenge_shown") {
      pulse.retentionChallengeShown += 1;
    }
    if (input.event === "rival_goal_saved") {
      pulse.retentionGoalSaved += 1;
    }
    if (input.event === "rival_requeue_clicked") {
      pulse.retentionRequeued += 1;
    }
    if (input.event === "rival_rematch_requested") {
      pulse.retentionRematchRequested += 1;
    }
  }

  return buildVaultFrontPlaytestPulseSummary(at);
}
export function buildVaultFrontPlaytestPulseSummary(
  now = Date.now(),
): VaultFrontPlaytestPulseSummary {
  const tutorialShownSessions = sessionsWith("tutorial", "shown");
  const tutorialCompletion =
    tutorialShownSessions > 0
      ? Number(
          (
            sessionsWith("tutorial", "complete") / tutorialShownSessions
          ).toFixed(4),
        )
      : 0;
  const tutorialAdvance =
    tutorialShownSessions > 0
      ? Number(
          (sessionsWith("tutorial", "advance") / tutorialShownSessions).toFixed(
            4,
          ),
        )
      : 0;
  const tutorialSkip =
    tutorialShownSessions > 0
      ? Number(
          (sessionsWith("tutorial", "skip") / tutorialShownSessions).toFixed(4),
        )
      : 0;
  const matchFeedback =
    humanSessionActors.size > 0
      ? Number(
          (
            sessionsWith(
              "match",
              "feedback",
              "feedback_epic",
              "feedback_balanced",
              "feedback_off",
            ) / humanSessionActors.size
          ).toFixed(4),
        )
      : 0;

  const retentionExposureSessions = sessionsWith(
    "retention",
    "rival_challenge_shown",
  );
  const retentionAction =
    retentionExposureSessions > 0
      ? Number(
          (
            sessionsWith(
              "retention",
              "rival_goal_saved",
              "rival_requeue_clicked",
              "rival_rematch_requested",
            ) / retentionExposureSessions
          ).toFixed(4),
        )
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
    pulse.events === 0 ? "no-signal" : score >= 30 ? "ready" : "warming";

  const actionInsights = buildActionInsights({
    tutorialAdvance,
    tutorialCompletion,
    tutorialSkip,
    matchFeedback,
    retentionAction,
    ageMinutes,
  });
  const alphaGate = buildAlphaGate({
    tutorialAdvance,
    tutorialCompletion,
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
    evidence: {
      acceptedHumanEvents: pulse.events,
      uniqueHumanSessions: humanSessionActors.size,
      uniqueHumanActors: new Set(humanSessionActors.values()).size,
      duplicateEvents,
      rejectedEvents,
      excludedBySource: { ...excludedBySource },
    },
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
    alphaGate,
  };
}

function buildAlphaGate(input: {
  tutorialAdvance: number;
  tutorialCompletion: number;
  matchFeedback: number;
  retentionAction: number;
  ageMinutes: number | null;
}): VaultFrontPlaytestPulseSummary["alphaGate"] {
  const checks = {
    fresh: input.ageMinutes !== null && input.ageMinutes <= 1440,
    sampleSize: new Set(humanSessionActors.values()).size >= 3,
    tutorial:
      pulse.tutorialShown > 0 &&
      input.tutorialAdvance >= 0.5 &&
      input.tutorialCompletion >= 0.35,
    feedback: pulse.matchFeedback > 0 && input.matchFeedback > 0,
    rivalExposure: pulse.retentionChallengeShown > 0,
    rivalAction:
      pulse.retentionChallengeShown > 0 && input.retentionAction >= 0.25,
  };
  const orderedFailures: Array<[keyof typeof checks, string]> = [
    [
      "fresh",
      "Refresh playtest evidence; the latest signal is older than 24 hours.",
    ],
    [
      "tutorial",
      "Prove onboarding: tutorial advance 50%+ and completion 35%+.",
    ],

    [
      "feedback",
      "Prove the post-match surface: record at least one feedback signal.",
    ],
    [
      "rivalExposure",
      "Seed rivalry revenge and show the Rival Challenge card.",
    ],
    ["rivalAction", "Drive Rival Challenge action rate to 25%+."],
    [
      "sampleSize",
      "Collect authenticated evidence from at least three distinct human actors.",
    ],
  ];
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const nextCheck =
    orderedFailures.find(([key]) => !checks[key])?.[1] ??
    "Alpha gate evidence is complete; run one more rivalry/rematch pass only if freshness expires.";
  const status =
    pulse.events === 0
      ? "not-started"
      : !checks.fresh
        ? "blocked"
        : passed === total
          ? "ready"
          : "warming";
  return {
    status,
    checks,
    passLabel:
      status === "ready"
        ? "Alpha gate passed: three authenticated actors, tutorial, feedback, rivalry exposure, Rival action, and freshness are all green."
        : `${passed}/${total} alpha gate checks passing.`,
    nextCheck,
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
