import { beforeEach, describe, expect, it } from "vitest";
import {
  buildVaultFrontPlaytestPulseSummary,
  recordVaultFrontPlaytestPulse,
  resetVaultFrontPlaytestPulseForTests,
} from "../../src/server/VaultFrontPlaytestPulse";

describe("VaultFront playtest pulse", () => {
  beforeEach(() => {
    resetVaultFrontPlaytestPulseForTests();
  });

  it("starts with no live alpha signal", () => {
    const summary = buildVaultFrontPlaytestPulseSummary(1_000);

    expect(summary.status).toBe("no-signal");
    expect(summary.score).toBe(0);
    expect(summary.freshness.lastEventAt).toBeNull();
    expect(summary.actionInsights[0]).toContain(
      "Run one guided internal match",
    );
    expect(summary.operatorNext.headline).toContain("guided first-match");
    expect(summary.operatorNext.steps.join(" ")).toContain("tutorial strip");
  });

  it("aggregates tutorial, match, tournament, and retention signals", () => {
    recordVaultFrontPlaytestPulse({
      surface: "tutorial",
      event: "shown",
      at: 10_000,
    });
    recordVaultFrontPlaytestPulse({
      surface: "tutorial",
      event: "advance",
      at: 10_500,
    });
    recordVaultFrontPlaytestPulse({
      surface: "tutorial",
      event: "complete",
      at: 11_000,
    });
    recordVaultFrontPlaytestPulse({
      surface: "match",
      event: "feedback_epic",
      at: 12_000,
    });
    recordVaultFrontPlaytestPulse({
      surface: "tournament",
      event: "seed_bracket",
      at: 13_000,
    });
    const summary = recordVaultFrontPlaytestPulse({
      surface: "retention",
      event: "rival_challenge_shown",
      at: 14_000,
    });

    expect(summary.status).toBe("ready");
    expect(summary.totals.tutorialShown).toBe(1);
    expect(summary.totals.tutorialAdvanced).toBe(1);
    expect(summary.totals.tutorialCompleted).toBe(1);
    expect(summary.totals.matchFeedback).toBe(1);
    expect(summary.totals.tournamentActions).toBe(1);
    expect(summary.totals.retentionSignals).toBe(1);
    expect(summary.totals.retentionChallengeShown).toBe(1);
    expect(summary.rates.tutorialAdvance).toBe(1);
    expect(summary.rates.tutorialCompletion).toBe(1);
    expect(summary.insights.join(" ")).toContain("post-match feedback");
    expect(summary.actionInsights.join(" ")).toContain("not converting");
    expect(summary.operatorNext.successMetric).toContain(
      "Rival Challenge action rate",
    );
  });

  it("calculates Rival Challenge action conversion", () => {
    recordVaultFrontPlaytestPulse({
      surface: "retention",
      event: "rival_challenge_shown",
      at: 20_000,
    });
    recordVaultFrontPlaytestPulse({
      surface: "retention",
      event: "rival_requeue_clicked",
      at: 21_000,
    });
    recordVaultFrontPlaytestPulse({
      surface: "match",
      event: "feedback_epic",
      at: 21_500,
    });
    const summary = buildVaultFrontPlaytestPulseSummary(22_000);

    expect(summary.totals.retentionChallengeShown).toBe(1);
    expect(summary.totals.retentionRequeued).toBe(1);
    expect(summary.rates.retentionAction).toBe(1);
    expect(summary.actionInsights.join(" ")).toContain(
      "focused rivalry/rematch",
    );
    expect(summary.operatorNext.steps.join(" ")).toContain(
      "guided rivalry scenario",
    );
  });

  it("turns stale activity into an operator refresh script", () => {
    recordVaultFrontPlaytestPulse({
      surface: "tutorial",
      event: "shown",
      at: 1_000,
    });

    const summary = buildVaultFrontPlaytestPulseSummary(25 * 60 * 60 * 1000);

    expect(summary.actionInsights.join(" ")).toContain("older than 24 hours");
    expect(summary.operatorNext.steps.length).toBeGreaterThanOrEqual(3);
  });
});
