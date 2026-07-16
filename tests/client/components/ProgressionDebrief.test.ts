import { render } from "lit";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  fetchAchievements,
  fetchSeasonProgress,
  fetchVaultFrontContracts,
} from "../../../src/client/Api";
import { ProgressionDebrief } from "../../../src/client/components/ProgressionDebrief";

vi.mock("../../../src/client/Api", () => ({
  fetchVaultFrontContracts: vi.fn(),
  fetchSeasonProgress: vi.fn(),
  fetchAchievements: vi.fn(),
}));

vi.mock("../../../src/client/Auth", () => ({
  getPersistentID: () => "00000000-0000-4000-8000-000000000001",
}));

describe("ProgressionDebrief", () => {
  beforeEach(() => {
    vi.mocked(fetchVaultFrontContracts).mockResolvedValue({
      eloRating: 1248,
      eloLabel: "Gold",
      matchesPlayed: 8,
      isDecaying: false,
      eloHistory: [1200, 1248],
    });
    vi.mocked(fetchSeasonProgress).mockResolvedValue({
      seasonId: "week-29",
      milestones: [
        {
          milestone: {
            id: "m2",
            tier: 2,
            title: "Getting Started",
            description: "Deliver 5 convoys",
            metric: "convoy_deliveries",
            target: 5,
            reward: { type: "badge", value: "bronze_convoy" },
          },
          progress: 4,
          target: 5,
          pct: 80,
          unlocked: false,
          claimed: false,
        },
      ],
    });
    vi.mocked(fetchAchievements).mockResolvedValue({
      achievements: [
        {
          id: "first_vault",
          unlockedAt: 1,
          progress: 100,
          progressLabel: "Unlocked",
        },
        {
          id: "ten_convoys",
          unlockedAt: null,
          progress: 40,
          progressLabel: "4 / 10 convoys",
        },
      ],
      metaChains: [],
    });
  });

  test("consolidates rating, season, and achievement progress", async () => {
    const debrief = new ProgressionDebrief() as any;
    debrief.visible = true;

    await debrief.refreshProgression();

    const container = document.createElement("div");
    render(debrief.render(), container);

    expect(container.textContent).toContain("Gold 1248");
    expect(container.textContent).toContain("Getting Started 4/5");
    expect(container.textContent).toContain("1/2 achievements");
  });
});
