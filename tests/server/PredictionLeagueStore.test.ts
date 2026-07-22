import { describe, expect, test, vi } from "vitest";
import { PredictionLeagueStore } from "../../src/server/PredictionLeagueStore";

vi.mock("../../src/server/Logger", () => ({
  logger: { info: vi.fn() },
}));

describe("PredictionLeagueStore", () => {
  test("returns an auditable resolution receipt and consumes a game once", () => {
    const store = new PredictionLeagueStore();
    store.recordPrediction("g1", "spectator-a", "intercept");
    store.recordPrediction("g1", "spectator-b", "delivery");

    expect(store.resolveGame("g1", "intercept")).toEqual({
      gameId: "g1",
      actualOutcome: "intercept",
      resolvedPredictions: 2,
    });
    expect(store.resolveGame("g1", "delivery")).toEqual({
      gameId: "g1",
      actualOutcome: "delivery",
      resolvedPredictions: 0,
    });
    expect(store.getSpectatorStats("spectator-a")).toMatchObject({
      totalPredictions: 1,
      correctPredictions: 1,
      accuracy: 100,
    });
  });
});
