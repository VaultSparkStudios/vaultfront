import { describe, expect, test } from "vitest";
import {
  deliverToVaultPressure,
  expireVaultPressureWindow,
  initialVaultPressureState,
  projectVaultPressure,
  type VaultPressureEvent,
} from "../../../src/core/execution/VaultPressureKernel";

describe("VaultPressureKernel", () => {
  test("opens on the third delivery and wins only inside the active window", () => {
    let state = initialVaultPressureState();
    for (const tick of [1000, 1010, 1020]) {
      state = deliverToVaultPressure(state, tick).state;
    }
    expect(state).toEqual({
      pressure: 3,
      breachWindowUntilTick: 1920,
      victorySecured: false,
    });
    expect(projectVaultPressure(state, 1020).deliveriesRequired).toBe(1);

    const victory = deliverToVaultPressure(state, 1919);
    expect(victory.events).toEqual([{ type: "vault-breach-victory" }]);
    expect(victory.state.victorySecured).toBe(true);
  });

  test("preserves the final-tick boundary and falls back to two after expiry", () => {
    const open = {
      pressure: 3,
      breachWindowUntilTick: 1100,
      victorySecured: false,
    };
    expect(expireVaultPressureWindow(open, 1100).events).toEqual([]);
    const atBoundary = deliverToVaultPressure(open, 1100);
    expect(atBoundary.events).toEqual([
      { type: "breach-window-opened", untilTick: 2000 },
    ]);

    const expired = expireVaultPressureWindow(open, 1101);
    expect(expired).toEqual({
      state: {
        pressure: 2,
        breachWindowUntilTick: 0,
        victorySecured: false,
      },
      events: [{ type: "breach-window-expired", pressure: 2 }],
    });
  });

  test("normalizes hostile state and is deterministic across long sequences", () => {
    const run = () => {
      let state = {
        pressure: -99,
        breachWindowUntilTick: -1,
        victorySecured: false,
      };
      const events: VaultPressureEvent[] = [];
      for (let tick = 0; tick < 5000; tick += 100) {
        const transition =
          tick % 400 === 0
            ? deliverToVaultPressure(state, tick)
            : expireVaultPressureWindow(state, tick);
        state = transition.state;
        events.push(...transition.events);
      }
      return { state, events };
    };
    expect(run()).toEqual(run());
    expect(run().state.pressure).toBeGreaterThanOrEqual(0);
    expect(run().state.pressure).toBeLessThanOrEqual(3);
  });
});
