import fs from "node:fs";
import { describe, expect, test } from "vitest";
import authority from "../../../config/vaultfront-balance.v1.json";
import {
  DEFAULT_VAULT_CONVOY_REWARD_TUNING,
  DEFAULT_VAULT_PRESSURE_CONFIG,
  planConvoyReward,
} from "../../../src/core/execution/VaultFrontBalance";

describe("VaultFront balance authority", () => {
  test("uses the versioned JSON authority without duplicated defaults", () => {
    expect(DEFAULT_VAULT_CONVOY_REWARD_TUNING).toEqual(authority.tuning);
    expect(Object.isFrozen(DEFAULT_VAULT_CONVOY_REWARD_TUNING)).toBe(true);
    expect(DEFAULT_VAULT_PRESSURE_CONFIG).toEqual(authority.pressure);
    expect(Object.isFrozen(DEFAULT_VAULT_PRESSURE_CONFIG)).toBe(true);
  });

  test("pins a reproducible boundary scenario and multiplier clamp", () => {
    const result = planConvoyReward({
      ownerStrength: 1,
      averageStrength: 1,
      distance: 70,
      routeRisk: 0.8,
      strengthMultiplier: 1,
      phaseMultiplier: 1,
      rewardScale: 1,
    });
    expect(result).toMatchObject({
      goldReward: 182_272n,
      troopsReward: 1_763,
      rewardMultiplier: 1.28,
      baselineGold: 120_000,
      distanceGold: 320,
    });
    expect(
      planConvoyReward({
        ownerStrength: 2.2,
        averageStrength: 1.8,
        distance: 140,
        routeRisk: 1,
        strengthMultiplier: 1.22,
        phaseMultiplier: 1.08,
        rewardScale: 1.5,
      }).rewardMultiplier,
    ).toBe(authority.tuning.rewardMultiplierMax);
  });

  test("publishes a counterexample-free deterministic envelope", () => {
    const envelope = JSON.parse(
      fs.readFileSync("public/balance-envelope.json", "utf8"),
    );
    expect(envelope).toMatchObject({
      status: "verified",
      scenarioCount: 28_125,
      counterexamples: [],
      pressureRules: authority.pressure,
    });
    expect(envelope.scenarioDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(envelope.tuningDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
