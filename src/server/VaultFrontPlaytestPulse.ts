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
    tutorialCompleted: number;
    tutorialSkipped: number;
    matchFeedback: number;
    tournamentActions: number;
    retentionSignals: number;
  };
  rates: {
    tutorialCompletion: number;
    tutorialSkip: number;
  };
  freshness: {
    firstEventAt: string | null;
    lastEventAt: string | null;
    ageMinutes: number | null;
  };
  recent: VaultFrontPlaytestPulseEvent[];
  insights: string[];
}

const MAX_RECENT = 40;

const pulse = {
  events: 0,
  tutorialShown: 0,
  tutorialCompleted: 0,
  tutorialSkipped: 0,
  matchFeedback: 0,
  tournamentActions: 0,
  retentionSignals: 0,
  firstEventAt: null as number | null,
  lastEventAt: null as number | null,
  recent: [] as VaultFrontPlaytestPulseEvent[],
};

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
    if (event.event === "complete") pulse.tutorialCompleted += value;
    if (event.event === "skip") pulse.tutorialSkipped += value;
  } else if (event.surface === "match") {
    pulse.matchFeedback += value;
  } else if (event.surface === "tournament") {
    pulse.tournamentActions += value;
  } else if (event.surface === "retention") {
    pulse.retentionSignals += value;
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
  const tutorialSkip =
    pulse.tutorialShown > 0
      ? Number((pulse.tutorialSkipped / pulse.tutorialShown).toFixed(4))
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

  return {
    generatedAt: new Date(now).toISOString(),
    status,
    score,
    totals: {
      events: pulse.events,
      tutorialShown: pulse.tutorialShown,
      tutorialCompleted: pulse.tutorialCompleted,
      tutorialSkipped: pulse.tutorialSkipped,
      matchFeedback: pulse.matchFeedback,
      tournamentActions: pulse.tournamentActions,
      retentionSignals: pulse.retentionSignals,
    },
    rates: {
      tutorialCompletion,
      tutorialSkip,
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
