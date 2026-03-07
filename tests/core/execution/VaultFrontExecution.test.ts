import { VaultFrontExecution } from "../../../src/core/execution/VaultFrontExecution";
import { UnitType } from "../../../src/core/game/Game";

function defaultRewardTuning() {
  return {
    minGoldReward: 120_000,
    minTroopsReward: 900,
    lowSignalEarlyWindowTicks: 900,
    riskMultiplierBase: 0.88,
    riskMultiplierScale: 0.5,
    rewardMultiplierMin: 0.58,
    rewardMultiplierMax: 1.5,
    baselineGoldOwnerStrengthScale: 360,
    baselineGoldAvgStrengthScale: 280,
    baselineGoldRiskBase: 0.9,
    baselineGoldRiskScale: 0.3,
    distanceGoldMin: 320,
    distanceGoldOwnerStrengthScale: 1.9,
    distanceGoldFlat: 260,
    distanceGoldRiskBase: 0.65,
    distanceGoldRiskScale: 0.6,
    troopsSqrtGoldScale: 2.2,
    troopsDistanceBase: 4,
    troopsDistanceRiskScale: 6,
  };
}

function mockPlayer(
  id: number,
  {
    tiles = 200,
    troops = 120_000,
    gold = 600_000,
  }: { tiles?: number; troops?: number; gold?: number } = {},
) {
  return {
    smallID: () => id,
    isAlive: () => true,
    numTilesOwned: () => tiles,
    troops: () => troops,
    gold: () => BigInt(gold),
  } as any;
}

describe("VaultFrontExecution", () => {
  test("reroute_safest prefers lower risk even when farther", () => {
    const execution = new VaultFrontExecution() as any;
    execution.game = {
      manhattanDist: (a: number, b: number) => Math.abs(a - b),
    };

    const owner = {
      units: () => [
        { type: () => UnitType.City, tile: () => 5 },
        { type: () => UnitType.Port, tile: () => 40 },
      ],
      spawnTile: () => 0,
    } as any;

    const riskByTile = new Map<number, number>([
      [5, 0.45],
      [40, 0.12],
    ]);
    vi.spyOn(execution, "routeRiskScore").mockImplementation(
      (_owner: unknown, _src: number, dst: number) => riskByTile.get(dst) ?? 1,
    );

    const destination = execution.bestConvoyDestination(
      owner,
      0,
      undefined,
      "reroute_safest",
    );

    expect(destination).toBe(40);
  });

  test("reroute_safest breaks equal-risk ties by shortest distance", () => {
    const execution = new VaultFrontExecution() as any;
    execution.game = {
      manhattanDist: (a: number, b: number) => Math.abs(a - b),
    };

    const owner = {
      units: () => [
        { type: () => UnitType.City, tile: () => 18 },
        { type: () => UnitType.Factory, tile: () => 30 },
      ],
      spawnTile: () => 0,
    } as any;

    vi.spyOn(execution, "routeRiskScore").mockReturnValue(0.2);
    const destination = execution.bestConvoyDestination(
      owner,
      10,
      undefined,
      "reroute_safest",
    );

    expect(destination).toBe(18);
  });

  test("convoyRewardPlan scales up with distance and risk, and down with rewardScale", () => {
    const execution = new VaultFrontExecution() as any;
    const owner = mockPlayer(1, { tiles: 250, troops: 180_000, gold: 700_000 });
    const peer = mockPlayer(2, { tiles: 260, troops: 170_000, gold: 680_000 });

    execution.game = {
      players: () => [owner, peer],
      config: () => ({
        numSpawnPhaseTurns: () => 0,
        vaultConvoyRewardTuning: () => defaultRewardTuning(),
      }),
    };

    const shortSafe = execution.convoyRewardPlan(owner, 30, 0.1, 4_000, 1);
    const longSafe = execution.convoyRewardPlan(owner, 80, 0.1, 4_000, 1);
    const longRisky = execution.convoyRewardPlan(owner, 80, 0.8, 4_000, 1);
    const longRiskyReduced = execution.convoyRewardPlan(owner, 80, 0.8, 4_000, 0.72);

    expect(longSafe.goldReward > shortSafe.goldReward).toBe(true);
    expect(longSafe.troopsReward > shortSafe.troopsReward).toBe(true);
    expect(longRisky.goldReward > longSafe.goldReward).toBe(true);
    expect(longRisky.troopsReward > longSafe.troopsReward).toBe(true);
    expect(longRiskyReduced.goldReward < longRisky.goldReward).toBe(true);
    expect(longRiskyReduced.troopsReward < longRisky.troopsReward).toBe(true);
  });

  test("bigintToSafeNumber clamps values beyond MAX_SAFE_INTEGER", () => {
    const execution = new VaultFrontExecution() as any;
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 50_000n;
    expect(execution.bigintToSafeNumber(huge)).toBe(Number.MAX_SAFE_INTEGER);
    expect(execution.bigintToSafeNumber(42n)).toBe(42);
  });

  test("vault passive income activity is not suppressed during low-signal window", () => {
    const execution = new VaultFrontExecution() as any;
    const addUpdate = vi.fn();
    execution.game = {
      ticks: () => 120,
      addUpdate,
      config: () => ({
        numSpawnPhaseTurns: () => 0,
        vaultConvoyRewardTuning: () => defaultRewardTuning(),
      }),
    };

    execution.emitActivity(
      "vault_passive_income",
      12,
      1,
      null,
      "Vault 1 passive +90,000g",
      120,
    );

    expect(addUpdate).toHaveBeenCalledTimes(1);
    expect(addUpdate.mock.calls[0][0].activity).toBe("vault_passive_income");
  });

  test("newly launched convoy is included in the published status update", () => {
    const execution = new VaultFrontExecution() as any;
    const addUpdate = vi.fn();
    const displayMessage = vi.fn();
    const owner = {
      smallID: () => 1,
      id: () => "p1",
      isPlayer: () => true,
      isAlive: () => true,
      displayName: () => "P1",
      spawnTile: () => 5,
      units: () => [{ type: () => UnitType.City, tile: () => 14 }],
      unitCount: () => 1,
      numTilesOwned: () => 220,
      troops: () => 150_000,
      gold: () => 500_000n,
    };
    execution.game = {
      addUpdate,
      displayMessage,
      players: () => [owner],
      playerBySmallID: () => owner,
      owner: () => owner,
      manhattanDist: (a: number, b: number) => Math.abs(a - b),
      ticks: () => 1000,
      stats: () => ({
        vaultConvoyLaunched: () => {},
        vaultInteraction: () => {},
      }),
      config: () => ({
        numSpawnPhaseTurns: () => 0,
        vaultConvoyRewardTuning: () => defaultRewardTuning(),
      }),
    };
    execution.executionStreakNextConvoyMultiplier = new Map([[1, 1]]);
    execution.preferredConvoyDestination = new Map([[1, UnitType.City]]);
    execution.escortUntilTick = new Map([[1, 0]]);
    execution.vaultSites = [
      {
        id: 1,
        tile: 9,
        controllerID: 1,
        controlTicks: 90,
        cooldownTicks: 0,
        passiveOwnerID: 1,
        nextPassiveGoldTick: 1600,
        reducedRewardNextCapture: false,
      },
    ];
    execution.beacons = new Map([[1, { charge: 80, cooldownUntil: 0, maskedUntil: 0 }]]);
    vi.spyOn(execution, "buildConvoyReroutePreviews").mockReturnValue([]);
    vi.spyOn(execution, "routeRiskScore").mockReturnValue(0.2);

    execution.startConvoy(owner, execution.vaultSites[0], 1000, 1);
    execution.publishStatusUpdate();

    const statusUpdate = addUpdate.mock.calls.at(-1)?.[0];
    expect(statusUpdate.convoys).toHaveLength(1);
    expect(statusUpdate.convoys[0]).toMatchObject({
      ownerID: 1,
      sourceTile: 9,
      destinationTile: 14,
    });
  });
});
