import { describe, expect, test, vi } from "vitest";
import { ContractHudWidget } from "../../../src/client/components/ContractHudWidget";
import { GameUpdateType } from "../../../src/core/game/GameUpdates";

describe("ContractHudWidget", () => {
  test("does not invent progress from client-observed activity", () => {
    const widget = new ContractHudWidget() as any;
    widget.contracts = [
      {
        key: "interceptionTiming",
        label: "Intercept Master",
        value: 0,
        target: 10,
      },
    ];
    widget.visible = true;
    widget.game = {
      updatesSinceLastTick: () => ({
        [GameUpdateType.VaultFrontActivity]: [
          { activity: "convoy_intercepted" },
        ],
      }),
    };
    vi.spyOn(widget, "loadContracts").mockResolvedValue(undefined);

    widget.tick();

    expect(widget.contracts[0].value).toBe(0);
    expect(widget.loadContracts).not.toHaveBeenCalled();
  });
});
