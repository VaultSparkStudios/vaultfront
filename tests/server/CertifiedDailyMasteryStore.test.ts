import { describe, expect, test, vi } from "vitest";
import {
  CertifiedDailyMasteryStore,
  type CertifiedMasteryOutcome,
} from "../../src/server/CertifiedDailyMasteryStore";
vi.mock("../../src/server/Logger", () => {
  const log = {
    child: () => log,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { logger: log };
});

const decisiveOutcome: CertifiedMasteryOutcome = {
  persistentId: "player-1",
  won: true,
  vaultCaptures: 10,
  convoyDeliveries: 10,
  convoyIntercepts: 10,
  executionChains: 10,
  surgeActivations: 10,
};

describe("CertifiedDailyMasteryStore", () => {
  test("derives progress from certified outcomes and awards mastery once", async () => {
    const store = new CertifiedDailyMasteryStore({
      now: () => new Date("2026-07-22T12:00:00.000Z"),
      pool: () => null,
      databaseConfigured: () => false,
    });

    const before = await store.getChallenge("player-1");
    expect(before).toMatchObject({
      progress: 0,
      completed: false,
      masteryBalance: 0,
      evidence: "certified-match-result",
      durability: "process-local",
    });

    const receipt = await store.recordCertifiedMatch(
      "certified-game-1",
      decisiveOutcome,
    );
    expect(receipt).toMatchObject({
      persistentId: "player-1",
      challengeId: before.challengeId,
      completedNow: true,
      masteryBalance: before.rewardMastery,
      durability: "process-local",
    });

    expect(
      await store.recordCertifiedMatch("certified-game-1", decisiveOutcome),
    ).toBeNull();
    const after = await store.getChallenge("player-1");
    expect(after.progress).toBe(after.target);
    expect(after.masteryBalance).toBe(before.rewardMastery);
  });

  test("isolates UTC days and player balances", async () => {
    let now = new Date("2026-07-22T23:59:59.000Z");
    const store = new CertifiedDailyMasteryStore({
      now: () => now,
      pool: () => null,
      databaseConfigured: () => false,
    });
    await store.recordCertifiedMatch("same-game-id", decisiveOutcome);
    now = new Date("2026-07-23T00:00:01.000Z");

    const nextDay = await store.getChallenge("player-1");
    expect(nextDay.progress).toBe(0);
    expect(nextDay.masteryBalance).toBeGreaterThan(0);
    expect(
      await store.recordCertifiedMatch("same-game-id", decisiveOutcome),
    ).not.toBeNull();
    expect((await store.getChallenge("player-2")).masteryBalance).toBe(0);
  });

  test("fails closed when configured persistence is unavailable", async () => {
    const store = new CertifiedDailyMasteryStore({
      pool: () => null,
      databaseConfigured: () => true,
    });
    await expect(store.getChallenge("player-1")).rejects.toThrow(
      "persistence unavailable",
    );
    await expect(
      store.recordCertifiedMatch("game-1", decisiveOutcome),
    ).rejects.toThrow("persistence unavailable");
  });

  test("sanitizes impossible certified counters", async () => {
    const store = new CertifiedDailyMasteryStore({
      now: () => new Date("2026-07-22T12:00:00.000Z"),
      pool: () => null,
      databaseConfigured: () => false,
    });
    const invalid = {
      ...decisiveOutcome,
      won: false,
      vaultCaptures: -1,
      convoyDeliveries: Number.POSITIVE_INFINITY,
      convoyIntercepts: 1.5,
      executionChains: Number.NaN,
      surgeActivations: -3,
    };
    const receipt = await store.recordCertifiedMatch("game-2", invalid);
    expect(receipt?.progress).toBe(0);
    expect(receipt?.completedNow).toBe(false);
  });
});
