import { describe, expect, it } from "vitest";
import {
  buildVaultFrontPlaytestPulseSummary,
  recordVaultFrontPlaytestPulse,
} from "../../src/server/VaultFrontPlaytestPulse";

describe("VaultFront playtest pulse", () => {
  it("starts with no live alpha signal", () => {
    const summary = buildVaultFrontPlaytestPulseSummary(1_000);

    expect(summary.status).toBe("no-signal");
    expect(summary.score).toBe(0);
    expect(summary.freshness.lastEventAt).toBeNull();
  });

  it("aggregates tutorial, match, tournament, and retention signals", () => {
    recordVaultFrontPlaytestPulse({
      surface: "tutorial",
      event: "shown",
      at: 10_000,
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
      event: "funnel_win",
      at: 14_000,
    });

    expect(summary.status).toBe("ready");
    expect(summary.totals.tutorialShown).toBe(1);
    expect(summary.totals.tutorialCompleted).toBe(1);
    expect(summary.totals.matchFeedback).toBe(1);
    expect(summary.totals.tournamentActions).toBe(1);
    expect(summary.totals.retentionSignals).toBe(1);
    expect(summary.rates.tutorialCompletion).toBe(1);
    expect(summary.insights.join(" ")).toContain("post-match feedback");
  });
});
