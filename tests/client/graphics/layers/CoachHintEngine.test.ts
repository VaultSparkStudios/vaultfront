import { beforeEach, describe, expect, test, vi } from "vitest";
import { fetchMicroHint } from "../../../../src/client/Api";
import {
  CoachHintEngine,
  localTacticalHint,
  type HintTrigger,
} from "../../../../src/client/graphics/layers/CoachHintEngine";
import { GameUpdateType } from "../../../../src/core/game/GameUpdates";

vi.mock("../../../../src/client/Api", async () => {
  const actual = await vi.importActual<object>("../../../../src/client/Api");
  return {
    ...actual,
    fetchMicroHint: vi.fn().mockResolvedValue("Capture the nearest vault."),
  };
});

const triggers: HintTrigger[] = [
  "idle",
  "convoy_lost",
  "bounty_placed",
  "last_stand_nearby",
  "chain_broken",
  "convoy_danger",
  "economy_stall",
];

function makeEngine(): any {
  const engine = new CoachHintEngine() as any;
  engine.game = {
    myPlayer: () => ({ smallID: () => 7 }),
    updatesSinceLastTick: () => ({
      [GameUpdateType.VaultFrontStatus]: [
        {
          sites: [
            { controllerID: 7, passiveOwnerID: null },
            { controllerID: null, passiveOwnerID: 7 },
            { controllerID: 2, passiveOwnerID: null },
          ],
          convoys: [],
        },
      ],
    }),
  };
  engine.latestStatus = {
    sites: [
      { controllerID: 7, passiveOwnerID: null },
      { controllerID: null, passiveOwnerID: 7 },
    ],
    convoys: [],
  };
  return engine;
}

describe("CoachHintEngine", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchMicroHint).mockClear();
  });

  test("defines an actionable local policy for every tactical trigger", () => {
    for (const trigger of triggers) {
      const hint = localTacticalHint(trigger, { gold: 90_000, sites: 1 });
      expect(hint.length).toBeGreaterThan(30);
    }
  });

  test("renders a local hint immediately without a paid call by default", async () => {
    const engine = makeEngine();
    engine.tickCount = 1199;

    engine.tick();
    await Promise.resolve();

    expect(fetchMicroHint).not.toHaveBeenCalled();
    expect(engine.visible).toBe(true);
    expect(engine.hint).toContain("Contest the nearest opening");
    expect(localStorage.getItem("vaultfront.kpi.coach.localHints")).toBe("1");
    expect(
      localStorage.getItem("vaultfront.kpi.coach.remoteCallsAvoided"),
    ).toBe("1");
  });

  test("optional remote enhancement is bounded and keeps cache semantics", async () => {
    localStorage.setItem("coachRemoteEnhancementEnabled", "true");
    const engine = makeEngine();

    await engine.fetchAndShow("idle");
    await engine.fetchAndShow("idle");

    expect(fetchMicroHint).toHaveBeenCalledTimes(1);
    expect(fetchMicroHint).toHaveBeenCalledWith({
      gold: expect.any(Number),
      sites: 2,
      trigger: "idle",
    });
    expect(engine.hint).toBe("Capture the nearest vault.");
    expect(
      localStorage.getItem("vaultfront.kpi.coach.remoteEnhancements"),
    ).toBe("1");
  });
});
