import { beforeEach, describe, expect, it } from "vitest";
import {
  clearConvoyMastery,
  persistConvoyMastery,
  readConvoyMastery,
  selectConvoyMastery,
} from "../../src/client/ConvoyMastery";

describe("Convoy Mastery prescription", () => {
  beforeEach(() => localStorage.clear());

  it("preserves a certified recap weakness over generic meta progress", () => {
    const result = selectConvoyMastery({
      savedGoal: { text: "Shield the next convoy.", goalKey: "convoy_impact" },
      milestones: [],
      now: 7,
    });
    expect(result).toMatchObject({ source: "recap", selectedAt: 7 });
  });

  it("chooses the nearest actionable season milestone deterministically", () => {
    const result = selectConvoyMastery({
      milestones: [
        {
          milestone: {
            id: "vaults",
            tier: 1,
            title: "Vault Hand",
            description: "Capture vaults",
            metric: "vault_captures",
            target: 10,
            reward: { type: "badge", value: "vault" },
          },
          progress: 9,
          target: 10,
          pct: 90,
          unlocked: false,
          claimed: false,
        },
      ],
      now: 9,
    });
    expect(result).toMatchObject({ source: "season", goalKey: "vault_first" });
    expect(result.text).toContain("1 vault captures remaining");
  });

  it("round-trips and clears the cross-match receipt", () => {
    const goal = selectConvoyMastery({ now: 11 });
    persistConvoyMastery(goal);
    expect(readConvoyMastery()).toEqual(goal);
    clearConvoyMastery();
    expect(readConvoyMastery()).toBeNull();
  });

  it("fails closed on malformed persisted payloads", () => {
    localStorage.setItem("vaultfront.convoyMasteryGoal.v1", "{broken");
    expect(readConvoyMastery()).toBeNull();
    localStorage.setItem("vaultfront.convoyMasteryGoal.v1", '{"text":7}');
    expect(readConvoyMastery()).toBeNull();
  });
});
