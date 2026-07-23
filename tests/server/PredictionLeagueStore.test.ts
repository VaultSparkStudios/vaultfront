import { describe, expect, test, vi } from "vitest";
import { PredictionLeagueStore } from "../../src/server/PredictionLeagueStore";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    info: vi.fn(),
  },
}));

describe("PredictionLeagueStore", () => {
  test("resolves each game once and permanently closes late predictions", async () => {
    const store = new PredictionLeagueStore({
      pool: () => null,
      databaseConfigured: () => false,
      now: () => Date.UTC(2026, 6, 23),
    });
    await expect(
      store.recordPrediction("g1", "spectator-a", "intercept"),
    ).resolves.toMatchObject({ accepted: true, durability: "process-local" });
    await expect(
      store.recordPrediction("g1", "spectator-b", "delivery"),
    ).resolves.toMatchObject({ accepted: true });
    await expect(store.resolveGame("g1", "intercept")).resolves.toEqual({
      gameId: "g1",
      actualOutcome: "intercept",
      resolvedPredictions: 2,
      durability: "process-local",
    });
    await expect(store.getGameConsensus("g1")).resolves.toMatchObject({
      intercept: 1,
      delivery: 1,
      total: 2,
      interceptPct: 50,
      status: "resolved",
    });
    await expect(store.resolveGame("g1", "delivery")).resolves.toMatchObject({
      resolvedPredictions: 0,
    });
    await expect(
      store.recordPrediction("g1", "spectator-c", "delivery"),
    ).resolves.toMatchObject({
      accepted: false,
      reason: "duplicate-or-closed",
    });
    await expect(store.getSpectatorStats("spectator-a")).resolves.toMatchObject(
      {
        totalPredictions: 1,
        correctPredictions: 1,
        accuracy: 100,
      },
    );
  });

  test("builds a weekly leaderboard only after two resolved picks", async () => {
    const store = new PredictionLeagueStore({
      pool: () => null,
      databaseConfigured: () => false,
      now: () => Date.UTC(2026, 6, 23),
    });
    for (const gameId of ["g1", "g2"]) {
      await store.recordPrediction(gameId, "spectator-a", "delivery");
      await store.resolveGame(gameId, "delivery");
    }
    await expect(store.getLeaderboard(10, true)).resolves.toEqual([
      expect.objectContaining({
        spectatorId: "spectator-a",
        totalPredictions: 2,
        accuracy: 100,
        weeklyScore: 2,
      }),
    ]);
  });

  test("fails closed instead of claiming durability when PostgreSQL is unavailable", async () => {
    const store = new PredictionLeagueStore({
      pool: () => null,
      databaseConfigured: () => true,
    });
    await expect(
      store.recordPrediction("g1", "spectator-a", "delivery"),
    ).rejects.toThrow("persistence unavailable");
    await expect(store.resolveGame("g1", "delivery")).rejects.toThrow(
      "persistence unavailable",
    );
  });

  test("serializes submit and resolution with the same PostgreSQL game lock", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("INSERT INTO prediction_league_predictions")) {
        return { rows: [{ game_id: "g1" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO prediction_league_games")) {
        return { rows: [{ game_id: "g1" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE prediction_league_predictions")) {
        return { rows: [{ spectator_id: "spectator-a" }], rowCount: 1 };
      }
      return { rows: [], rowCount: null };
    });
    const release = vi.fn();
    const database = { connect: vi.fn(async () => ({ query, release })) };
    const store = new PredictionLeagueStore({
      pool: () => database as any,
      databaseConfigured: () => true,
      now: () => Date.UTC(2026, 6, 23),
    });

    await store.recordPrediction("g1", "spectator-a", "delivery");
    await store.resolveGame("g1", "delivery");
    const locks = query.mock.calls.filter(([sql]) =>
      sql.includes("pg_advisory_xact_lock"),
    );
    expect(locks).toHaveLength(2);
    expect(locks[0][1]).toEqual(["g1"]);
    expect(locks[1][1]).toEqual(["g1"]);
    expect(release).toHaveBeenCalledTimes(2);
  });
});
