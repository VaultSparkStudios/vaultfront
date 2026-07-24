import fs from "node:fs";
import { describe, expect, test, vi } from "vitest";
import {
  CertifiedSeasonPassStore,
  type CertifiedSeasonPassOutcome,
} from "../../src/server/SeasonMilestoneStore";

vi.mock("../../src/server/Logger", () => {
  const log = {
    child: () => log,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { logger: log };
});

const outcome: CertifiedSeasonPassOutcome = {
  persistentId: "player-1",
  vaultCaptures: 4,
  convoyDeliveries: 2,
  executionChains: 1,
  achievementsUnlocked: 1,
};

function localStore(now = new Date("2026-07-23T12:00:00.000Z")) {
  return new CertifiedSeasonPassStore({
    pool: () => null,
    databaseConfigured: () => false,
    now: () => now,
  });
}

describe("CertifiedSeasonPassStore", () => {
  test("accepts each certified game once and derives milestone progress", async () => {
    const store = localStore();
    expect(
      await store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).toMatchObject({
      evidence: "certified-match-result",
      durability: "process-local",
    });
    expect(
      await store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).toBeNull();
    await store.recordCertifiedMatch("game-2", "week-29", outcome);
    const state = await store.recordCertifiedMatch(
      "game-3",
      "week-29",
      outcome,
    );

    expect(
      state?.milestones.find(({ milestone }) => milestone.id === "m1"),
    ).toMatchObject({
      progress: 3,
      unlocked: true,
      claimed: false,
    });
    expect(
      state?.milestones.find(({ milestone }) => milestone.id === "m3"),
    ).toMatchObject({
      progress: 12,
      unlocked: true,
    });
  });

  test("materializes an idempotent cosmetic entitlement", async () => {
    const store = localStore();
    for (const gameId of ["game-1", "game-2", "game-3"]) {
      await store.recordCertifiedMatch(gameId, "week-29", outcome);
    }
    await expect(store.claim("player-1", "week-29", "m1")).resolves.toEqual({
      claimed: true,
      reason: "claimed",
      entitlement: {
        milestoneId: "m1",
        type: "title",
        value: "Rookie",
        claimedAt: "2026-07-23T12:00:00.000Z",
      },
      durability: "process-local",
    });
    await expect(
      store.claim("player-1", "week-29", "m1"),
    ).resolves.toMatchObject({
      claimed: false,
      reason: "already-claimed",
    });
    expect(
      (await store.getState("player-1", "week-29")).entitlements,
    ).toHaveLength(1);
  });

  test("rejects locked, unknown, and impossible progress", async () => {
    const store = localStore();
    await store.recordCertifiedMatch("game-1", "week-29", {
      ...outcome,
      vaultCaptures: -4,
      convoyDeliveries: Number.POSITIVE_INFINITY,
      executionChains: 1.5,
      achievementsUnlocked: 100_001,
    });
    await expect(
      store.claim("player-1", "week-29", "m1"),
    ).resolves.toMatchObject({ reason: "locked" });
    await expect(
      store.claim("player-1", "week-29", "missing"),
    ).resolves.toMatchObject({ reason: "unknown-milestone" });
    const state = await store.getState("player-1", "week-29");
    expect(
      state.milestones.find(({ milestone }) => milestone.id === "m3")?.progress,
    ).toBe(0);
    expect(
      state.milestones.find(({ milestone }) => milestone.id === "m10")
        ?.progress,
    ).toBe(10_000);
  });

  test("fails closed when configured persistence is unavailable", async () => {
    const store = new CertifiedSeasonPassStore({
      pool: () => null,
      databaseConfigured: () => true,
    });
    await expect(store.getState("player-1", "week-29")).rejects.toThrow(
      "persistence unavailable",
    );
    await expect(
      store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).rejects.toThrow("persistence unavailable");
    await expect(store.claim("player-1", "week-29", "m1")).rejects.toThrow(
      "persistence unavailable",
    );
  });

  test("commits progress atomically and rolls duplicate events back", async () => {
    let duplicate = false;
    const clientQuery = vi.fn(async (sql: string) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql))
        return { rows: [], rowCount: null };
      if (sql.includes("INSERT INTO season_pass_events")) {
        return {
          rows: duplicate ? [] : [{ game_id: "game-1" }],
          rowCount: duplicate ? 0 : 1,
        };
      }
      if (sql.includes("INSERT INTO season_pass_progress"))
        return {
          rows: [
            {
              matches_played: 1,
              gold_delivered_k: 0,
              vault_captures: 4,
              convoy_deliveries: 2,
              achievements_unlocked: 1,
              chain_combos: 1,
            },
          ],
          rowCount: 1,
        };
      if (sql.includes("FROM season_pass_entitlements"))
        return { rows: [], rowCount: 0 };
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const databaseQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM season_pass_progress")) {
        return {
          rows: [
            {
              matches_played: 1,
              gold_delivered_k: 0,
              vault_captures: 4,
              convoy_deliveries: 2,
              achievements_unlocked: 1,
              chain_combos: 1,
            },
          ],
        };
      }
      if (sql.includes("FROM season_pass_entitlements")) return { rows: [] };
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const release = vi.fn();
    const database = {
      connect: vi.fn(async () => ({ query: clientQuery, release })),
      query: databaseQuery,
    };
    const store = new CertifiedSeasonPassStore({
      pool: () => database as any,
      databaseConfigured: () => true,
    });

    await expect(
      store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).resolves.toMatchObject({ durability: "postgres" });
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    duplicate = true;
    await expect(
      store.recordCertifiedMatch("game-1", "week-29", outcome),
    ).resolves.toBeNull();
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledTimes(2);
  });

  test("restores claimed entitlements from PostgreSQL after a store restart", async () => {
    const claimedAt = new Date("2026-07-23T12:00:00.000Z");
    const entitlementRow = {
      milestone_id: "m1",
      reward_type: "title",
      reward_value: "Rookie",
      claimed_at: claimedAt,
    };
    const clientQuery = vi.fn(async (sql: string) => {
      if (["BEGIN", "COMMIT"].includes(sql))
        return { rows: [], rowCount: null };
      if (sql.includes("SELECT matches_played AS progress")) {
        return { rows: [{ progress: 3 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO season_pass_entitlements")) {
        return { rows: [entitlementRow], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const databaseQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM season_pass_progress")) {
        return {
          rows: [
            {
              matches_played: 3,
              gold_delivered_k: 0,
              vault_captures: 0,
              convoy_deliveries: 0,
              achievements_unlocked: 0,
              chain_combos: 0,
            },
          ],
        };
      }
      if (sql.includes("FROM season_pass_entitlements")) {
        return { rows: [entitlementRow] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });
    const database = {
      connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
      query: databaseQuery,
    };
    const beforeRestart = new CertifiedSeasonPassStore({
      pool: () => database as any,
      databaseConfigured: () => true,
    });
    await expect(
      beforeRestart.claim("player-1", "week-29", "m1"),
    ).resolves.toMatchObject({
      claimed: true,
      entitlement: { milestoneId: "m1", value: "Rookie" },
    });

    const afterRestart = new CertifiedSeasonPassStore({
      pool: () => database as any,
      databaseConfigured: () => true,
    });
    const restored = await afterRestart.getState("player-1", "week-29");
    expect(restored.entitlements).toEqual([
      {
        milestoneId: "m1",
        type: "title",
        value: "Rookie",
        claimedAt: claimedAt.toISOString(),
      },
    ]);
    expect(restored.milestones[0].claimed).toBe(true);
  });

  test("schema owns event, aggregate, and entitlement durability", () => {
    const schema = fs.readFileSync("src/server/db/schema.sql", "utf8");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS season_pass_events");
    expect(schema).toContain("PRIMARY KEY (persistent_id, season_id, game_id)");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS season_pass_progress");
    expect(schema).toContain(
      "CREATE TABLE IF NOT EXISTS season_pass_entitlements",
    );
    expect(schema).toContain("CHECK (reward_type IN ('title', 'badge'))");
  });
});
