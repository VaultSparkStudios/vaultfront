import { describe, expect, test, vi } from "vitest";
import { ServerAuthoritativeProgressionSpine } from "../../src/server/MatchProgression";

vi.mock("../../src/server/Logger", () => {
  const log = {
    child: () => log,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { logger: log };
});

describe("ServerAuthoritativeProgressionSpine", () => {
  test("fans one authoritative outcome into existing stores exactly once", async () => {
    const recordMatch = vi.fn().mockResolvedValue(undefined);
    const getPlayerStats = vi.fn(async (id: string) => ({
      persistentId: id,
      displayName: id,
      eloRating: id === "p1" ? 1232 : 1184,
      matchesPlayed: 1,
      wins: id === "p1" ? 1 : 0,
      losses: id === "p1" ? 0 : 1,
      vaultCaptures: id === "p1" ? 2 : 1,
      convoyDeliveries: id === "p1" ? 3 : 0,
      executionChains: id === "p1" ? 1 : 0,
      surgeActivations: 0,
      placementComplete: false,
      placementMatchNumber: 2,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }));
    const checkAndUnlock = vi.fn(() => []);
    const recordSeasonActivity = vi.fn();
    const spine = new ServerAuthoritativeProgressionSpine({
      recordMatch,
      getPlayerStats,
      checkAndUnlock,
      recordSeasonActivity,
    });
    const outcome = {
      gameId: "game-1",
      durationSeconds: 420,
      mapName: "plains",
      seasonId: "week-29",
      onMutator: true,
      players: [
        {
          persistentId: "p1",
          displayName: "Winner",
          won: true,
          vaultCaptures: 2,
          convoyDeliveries: 3,
          executionChains: 1,
          surgeActivations: 1,
        },
        {
          persistentId: "p2",
          displayName: "RunnerUp",
          won: false,
          vaultCaptures: 1,
          convoyDeliveries: 0,
          executionChains: 0,
          surgeActivations: 0,
        },
      ],
    };

    const first = await spine.record(outcome);
    const duplicate = await spine.record(outcome);

    expect(first).toMatchObject({ duplicate: false, playersRecorded: 2 });
    expect(duplicate).toMatchObject({ duplicate: true, playersRecorded: 0 });
    expect(recordMatch).toHaveBeenCalledTimes(1);
    expect(recordMatch.mock.calls[0][3].statsByPersistentId).toEqual({
      p1: { vaultCaptures: 2, convoyDeliveries: 3, executionChains: 1 },
      p2: { vaultCaptures: 1, convoyDeliveries: 0, executionChains: 0 },
    });
    expect(getPlayerStats).toHaveBeenCalledTimes(2);
    expect(checkAndUnlock).toHaveBeenCalledWith("p1", {
      type: "match_ended",
      won: true,
      durationSeconds: 420,
      onMutator: true,
      eloRating: 1232,
    });
    expect(recordSeasonActivity).toHaveBeenCalledWith(
      "p1",
      "week-29",
      "convoy_deliveries",
      3,
    );
  });
});
