import { describe, expect, test, vi } from "vitest";
import { fetchMicroHint } from "../../../../src/client/Api";
import { CoachHintEngine } from "../../../../src/client/graphics/layers/CoachHintEngine";
import { GameUpdateType } from "../../../../src/core/game/GameUpdates";

vi.mock("../../../../src/client/Api", async () => {
  const actual = await vi.importActual<object>("../../../../src/client/Api");
  return {
    ...actual,
    fetchMicroHint: vi.fn().mockResolvedValue("Capture the nearest vault."),
  };
});

describe("CoachHintEngine", () => {
  test("passes local controlled vault sites to micro-hint requests", async () => {
    localStorage.removeItem("coachHintsDisabled");
    const engine = new CoachHintEngine() as any;
    engine.tickCount = 1199;
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
          },
        ],
      }),
    };

    engine.tick();
    await Promise.resolve();

    expect(fetchMicroHint).toHaveBeenCalledWith({
      gold: expect.any(Number),
      sites: 2,
    });
  });
});
