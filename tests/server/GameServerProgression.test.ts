import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../src/core/configuration/ConfigLoader", () => ({
  getServerConfigFromServer: () => ({
    otelEnabled: () => false,
    otelAuthHeader: () => "",
    otelEndpoint: () => "",
    env: () => 0,
  }),
  getServerConfig: () => ({ otelEnabled: () => false }),
}));

vi.mock("../../src/server/MatchProgression", () => ({
  matchProgressionSpine: { record: vi.fn().mockResolvedValue({}) },
}));

vi.mock("../../src/server/VaultSeasonScheduler", () => ({
  vaultSeasonScheduler: { getStatus: () => ({ weekNumber: 29 }) },
}));

import { GameType } from "../../src/core/game/Game";
import { GameServer } from "../../src/server/GameServer";
import { matchProgressionSpine } from "../../src/server/MatchProgression";

describe("GameServer progression wiring", () => {
  const logger = {
    child: vi.fn().mockReturnThis(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const config = {
    turnIntervalMs: () => 100,
    gameCreationRate: () => 1000,
    env: () => 0,
  };

  beforeEach(() => {
    vi.mocked(matchProgressionSpine.record).mockClear();
  });

  test("builds the authoritative envelope from the accepted winner vote", async () => {
    const game = new GameServer(
      "game1234",
      logger as any,
      Date.now(),
      config as any,
      {
        gameType: GameType.Private,
        gameMap: "plains",
        vaultWeeklyMutator: "lane_fog",
      } as any,
    );
    (game as any)._startTime = Date.now() - 420_000;
    (game as any).gameStartInfo = {
      config: { gameMap: "plains", vaultWeeklyMutator: "lane_fog" },
      players: [
        { clientID: "client01", username: "Winner" },
        { clientID: "client02", username: "RunnerUp" },
      ],
    };
    (game as any).allClients = new Map([
      ["client01", { persistentID: "p1" }],
      ["client02", { persistentID: "p2" }],
    ]);
    (game as any).winner = {
      type: "winner",
      winner: ["player", "client01"],
      allPlayersStats: {
        client01: {
          vaultfront: {
            vaultCaptures: 2n,
            vaultConvoysDelivered: 3n,
            cleanExecutionStreaks: 1n,
            surgeActivations: 1n,
          },
        },
        client02: {
          vaultfront: {
            vaultCaptures: 1n,
            vaultConvoysDelivered: 0n,
            cleanExecutionStreaks: 0n,
            surgeActivations: 0n,
          },
        },
      },
    };

    (game as any).recordProgressionOutcome();
    await Promise.resolve();

    expect(matchProgressionSpine.record).toHaveBeenCalledTimes(1);
    expect(matchProgressionSpine.record).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "game1234",
        mapName: "plains",
        seasonId: "week-29",
        onMutator: true,
        players: [
          expect.objectContaining({
            persistentId: "p1",
            displayName: "Winner",
            won: true,
            convoyDeliveries: 3,
          }),
          expect.objectContaining({
            persistentId: "p2",
            displayName: "RunnerUp",
            won: false,
            vaultCaptures: 1,
          }),
        ],
      }),
    );
  });
});
