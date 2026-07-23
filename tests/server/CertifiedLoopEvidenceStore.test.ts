import { describe, expect, test, vi } from "vitest";
import {
  CertifiedLoopEvidenceStore,
  type CertifiedLoopEvidenceInput,
} from "../../src/server/CertifiedLoopEvidenceStore";

vi.mock("../../src/server/Logger", () => {
  const log = {
    child: () => log,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { logger: log };
});

const input: CertifiedLoopEvidenceInput = {
  gameId: "game-1",
  durationSeconds: 420,
  turnIntervalMs: 100,
  players: [
    {
      vaultCaptures: 2,
      convoyDeliveries: 1,
      convoyIntercepts: 0,
      convoysLost: 0,
      firstVaultCaptureTick: 120,
      firstConvoyOutcomeTick: 300,
    },
    {
      vaultCaptures: 0,
      convoyDeliveries: 0,
      convoyIntercepts: 1,
      convoysLost: 1,
      firstConvoyOutcomeTick: 500,
    },
  ],
  intentFunnel: {
    early: { "vault.scout": 3 },
    mid: { "convoy.escort": 2 },
    late: { "convoy.intercept": 1 },
  },
};

describe("CertifiedLoopEvidenceStore", () => {
  test("derives privacy-minimal timing and participation once per certified game", async () => {
    const store = new CertifiedLoopEvidenceStore({
      pool: () => null,
      databaseConfigured: () => false,
      now: () => 123,
    });

    await expect(store.recordCertifiedMatch(input)).resolves.toMatchObject({
      gameId: "game-1",
      playerSamples: 2,
      vaultParticipants: 1,
      outcomeParticipants: 2,
      completedCycleParticipants: 1,
      evidence: "certified-match-result",
      durability: "process-local",
    });
    await expect(store.recordCertifiedMatch(input)).resolves.toBeNull();
    await expect(store.getSummary()).resolves.toEqual({
      generatedAt: 123,
      matches: 1,
      playerSamples: 2,
      vaultParticipants: 1,
      outcomeParticipants: 2,
      completedCycleParticipants: 1,
      vaultParticipationRatePct: 50,
      cycleCompletionRatePct: 100,
      averageFirstVaultSeconds: 12,
      averageFirstOutcomeSeconds: 40,
      phases: input.intentFunnel,
      evidence: "certified-match-result",
      durability: "process-local",
    });
    expect(JSON.stringify(await store.getSummary())).not.toContain("player-");
  });

  test("isolates matches, sanitizes intent keys, and bounds invalid counters", async () => {
    const store = new CertifiedLoopEvidenceStore({
      pool: () => null,
      databaseConfigured: () => false,
    });
    await store.recordCertifiedMatch({
      ...input,
      gameId: "game-2",
      players: [{ ...input.players[0], vaultCaptures: -1 }],
      intentFunnel: {
        early: { "bad intent!": 100_001 },
        mid: {},
        late: {},
      },
    });
    const summary = await store.getSummary();
    expect(summary.matches).toBe(1);
    expect(summary.vaultParticipants).toBe(0);
    expect(summary.phases.early).toEqual({ bad_intent_: 100_000 });
  });

  test("fails closed when configured persistence is unavailable", async () => {
    const store = new CertifiedLoopEvidenceStore({
      pool: () => null,
      databaseConfigured: () => true,
    });
    await expect(store.recordCertifiedMatch(input)).rejects.toThrow(
      "persistence unavailable",
    );
    await expect(store.getSummary()).rejects.toThrow("persistence unavailable");
  });

  test("uses an idempotent PostgreSQL insert and reports durable evidence", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ game_id: "game-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const store = new CertifiedLoopEvidenceStore({
      pool: () => ({ query }) as any,
      databaseConfigured: () => true,
    });
    await expect(store.recordCertifiedMatch(input)).resolves.toMatchObject({
      durability: "postgres",
    });
    await expect(store.recordCertifiedMatch(input)).resolves.toBeNull();
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT DO NOTHING");
    expect(query.mock.calls[0][1]).toHaveLength(11);
  });
});
