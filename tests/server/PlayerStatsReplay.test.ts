import { describe, expect, test, vi } from "vitest";
import { PlayerStatsStore } from "../../src/server/PlayerStatsStore";

vi.mock("../../src/server/Logger", () => {
  const log = {
    child: () => log,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { logger: log };
});

describe("PlayerStatsStore certified replay protection", () => {
  test("records each participant/game once in the process-local store", async () => {
    const store = new PlayerStatsStore();
    const result = {
      won: true,
      durationSeconds: 300,
      vaultCaptures: 2,
      convoyDeliveries: 1,
      executionChains: 1,
      mapName: "plains",
      playerCount: 2,
      allPlayers: [
        { persistentId: "p1", displayName: "One", won: true },
        { persistentId: "p2", displayName: "Two", won: false },
      ],
      statsByPersistentId: {
        p1: { vaultCaptures: 2, convoyDeliveries: 1, executionChains: 1 },
        p2: { vaultCaptures: 0, convoyDeliveries: 0, executionChains: 0 },
      },
    };

    await expect(
      store.recordMatch("p1", "One", "game-replay", result),
    ).resolves.toBe(true);
    await expect(
      store.recordMatch("p1", "One", "game-replay", result),
    ).resolves.toBe(false);

    expect(await store.getHistory("p1")).toHaveLength(1);
    expect(await store.getHistory("p2")).toHaveLength(1);
    expect((await store.getPlayerStats("p1"))?.matchesPlayed).toBe(1);
    expect((await store.getPlayerStats("p2"))?.matchesPlayed).toBe(1);
  });
});
