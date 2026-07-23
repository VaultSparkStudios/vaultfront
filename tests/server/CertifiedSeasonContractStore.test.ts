import { describe, expect, test, vi } from "vitest";
import {
  CertifiedSeasonContractStore,
  type CertifiedSeasonContractOutcome,
} from "../../src/server/CertifiedSeasonContractStore";

vi.mock("../../src/server/Logger", () => {
  const log = {
    child: () => log,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { logger: log };
});

const outcome: CertifiedSeasonContractOutcome = {
  persistentId: "player-1",
  vaultCaptures: 3,
  convoyDeliveries: 2,
  convoyIntercepts: 4,
  convoysLost: 1,
  surgeActivations: 2,
};

describe("CertifiedSeasonContractStore", () => {
  test("derives bounded progress and accepts a certified game once", async () => {
    const store = new CertifiedSeasonContractStore({
      pool: () => null,
      databaseConfigured: () => false,
    });
    const receipt = await store.recordCertifiedMatch(
      "game-1",
      "week-29",
      outcome,
    );
    expect(receipt).toEqual({
      seasonId: "week-29",
      interceptionTiming: 4,
      objectiveDenial: 7,
      comebackExecution: 1,
      surgeExecution: 2,
      evidence: "certified-match-result",
      durability: "process-local",
    });
    expect(
      await store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).toBeNull();
    expect(await store.getState("player-1", "week-29")).toEqual(receipt);
  });

  test("isolates players and seasons and sanitizes impossible counters", async () => {
    const store = new CertifiedSeasonContractStore({
      pool: () => null,
      databaseConfigured: () => false,
    });
    await store.recordCertifiedMatch("game-1", "week-29", {
      ...outcome,
      vaultCaptures: -1,
      convoyDeliveries: Number.POSITIVE_INFINITY,
      convoyIntercepts: 1.5,
      convoysLost: Number.NaN,
      surgeActivations: 100_001,
    });
    expect(await store.getState("player-1", "week-29")).toMatchObject({
      interceptionTiming: 0,
      objectiveDenial: 0,
      comebackExecution: 0,
      surgeExecution: 10_000,
    });
    expect(await store.getState("player-1", "week-30")).toMatchObject({
      objectiveDenial: 0,
    });
    expect(await store.getState("player-2", "week-29")).toMatchObject({
      objectiveDenial: 0,
    });
  });

  test("fails closed when configured persistence is unavailable", async () => {
    const store = new CertifiedSeasonContractStore({
      pool: () => null,
      databaseConfigured: () => true,
    });
    await expect(store.getState("player-1", "week-29")).rejects.toThrow(
      "persistence unavailable",
    );
    await expect(
      store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).rejects.toThrow("persistence unavailable");
  });

  test("commits PostgreSQL progress atomically and rolls duplicate events back", async () => {
    let duplicate = false;
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: null };
      }
      if (sql.includes("INSERT INTO season_contract_events")) {
        return {
          rows: duplicate ? [] : [{ game_id: "game-1" }],
          rowCount: duplicate ? 0 : 1,
        };
      }
      if (sql.includes("INSERT INTO season_contract_progress")) {
        return {
          rows: [
            {
              interception_timing: 4,
              objective_denial: 7,
              comeback_execution: 1,
              surge_execution: 2,
            },
          ],
          rowCount: 1,
        };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const release = vi.fn();
    const database = {
      connect: vi.fn(async () => ({ query, release })),
    };
    const store = new CertifiedSeasonContractStore({
      pool: () => database as any,
      databaseConfigured: () => true,
    });

    await expect(
      store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).resolves.toMatchObject({
      objectiveDenial: 7,
      durability: "postgres",
    });
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);

    duplicate = true;
    await expect(
      store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(2);
  });
});
