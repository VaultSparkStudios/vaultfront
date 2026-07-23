import { describe, expect, test, vi } from "vitest";
import {
  EVIDENCE_RETENTION_DAYS,
  PlaytestEvidenceConflictError,
  PlaytestEvidenceStore,
} from "../../src/server/PlaytestEvidenceStore";
import {
  buildVaultFrontPlaytestPulseSummaryFromEvents,
  type VaultFrontPlaytestPulseEvent,
} from "../../src/server/VaultFrontPlaytestPulse";

vi.mock("../../src/server/Logger", () => {
  const log = {
    child: () => log,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { logger: log };
});

const baseEvent = {
  surface: "tutorial" as const,
  event: "shown",
  value: 1 as const,
  evidenceSessionId: "session-alpha-0001",
  eventId: "event-alpha-000001",
  source: "human" as const,
  actorKey: "actor-alpha-1",
};

describe("PlaytestEvidenceStore", () => {
  test("keeps process-local fallback honest, idempotent, and actor-bound", async () => {
    let now = Date.parse("2026-07-22T12:00:00.000Z");
    const store = new PlaytestEvidenceStore({
      now: () => now,
      pool: () => null,
      databaseConfigured: () => false,
    });

    const first = await store.record(baseEvent);
    expect(first).toMatchObject({
      durability: "process-local",
      evidenceWindowHours: 24,
      totals: { events: 1 },
    });
    expect((await store.record(baseEvent)).totals.events).toBe(1);
    await expect(
      store.record({
        ...baseEvent,
        actorKey: "actor-alpha-2",
        eventId: "event-alpha-000002",
      }),
    ).rejects.toBeInstanceOf(PlaytestEvidenceConflictError);

    now += 24 * 60 * 60 * 1000 + 1;
    expect((await store.summary()).totals.events).toBe(0);
  });

  test("fails closed when configured persistence is unavailable", async () => {
    const store = new PlaytestEvidenceStore({
      pool: () => null,
      databaseConfigured: () => true,
    });
    await expect(store.summary()).rejects.toThrow(
      "playtest evidence persistence unavailable",
    );
    await expect(store.record(baseEvent)).rejects.toThrow(
      "playtest evidence persistence unavailable",
    );
  });

  test("rehydrates a privacy-minimal summary from a durable event cohort", () => {
    const at = Date.parse("2026-07-22T12:00:00.000Z");
    const events: VaultFrontPlaytestPulseEvent[] = [
      { ...baseEvent, at },
      {
        ...baseEvent,
        event: "advance",
        eventId: "event-alpha-000002",
        at: at + 1_000,
      },
    ];
    const summary = buildVaultFrontPlaytestPulseSummaryFromEvents(
      events,
      at + 2_000,
      "postgres",
    );

    expect(summary.durability).toBe("postgres");
    expect(summary.rates.tutorialAdvance).toBe(1);
    expect(summary.recent[0]).toEqual({
      surface: "tutorial",
      event: "advance",
      value: 1,
      at: at + 1_000,
      source: "human",
    });
    expect(JSON.stringify(summary.recent)).not.toContain("session-alpha");
    expect(JSON.stringify(summary.recent)).not.toContain("event-alpha");
    expect(JSON.stringify(summary.recent)).not.toContain("actor-alpha");
  });

  test("rehydrates PostgreSQL evidence across store instances", async () => {
    const at = Date.parse("2026-07-22T12:00:00.000Z");
    const fake = new FakePool();
    const first = new PlaytestEvidenceStore({
      now: () => at,
      pool: () => fake as never,
      databaseConfigured: () => true,
    });
    await first.record(baseEvent);

    const restarted = new PlaytestEvidenceStore({
      now: () => at + 1_000,
      pool: () => fake as never,
      databaseConfigured: () => true,
    });
    const summary = await restarted.summary();
    expect(summary.durability).toBe("postgres");
    expect(summary.totals.events).toBe(1);
    expect(fake.events).toHaveLength(1);
  });

  test("bounds retained evidence and releases expired session bindings", async () => {
    let now = Date.parse("2026-07-22T12:00:00.000Z");
    const store = new PlaytestEvidenceStore({
      now: () => now,
      pool: () => null,
      databaseConfigured: () => false,
    });
    await store.record(baseEvent);
    now += (EVIDENCE_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000;
    await expect(
      store.record({
        ...baseEvent,
        actorKey: "actor-alpha-2",
        eventId: "event-after-retention-0001",
      }),
    ).resolves.toMatchObject({ totals: { events: 1 } });
  });
});

class FakePool {
  readonly sessions = new Map<string, string>();
  readonly events: Array<Record<string, unknown>> = [];

  async connect() {
    return {
      query: (sql: string, params: unknown[]) =>
        this.transactionQuery(sql, params),
      release: () => undefined,
    };
  }

  async query(sql: string, params: Date[]) {
    if (!sql.includes("FROM playtest_evidence_events")) {
      throw new Error(`unexpected pool query: ${sql}`);
    }
    const [cutoff, now] = params.map((value) => value.getTime());
    return {
      rows: this.events.filter((row) => {
        const occurredAt = (row.occurred_at as Date).getTime();
        return occurredAt >= cutoff && occurredAt <= now;
      }),
    };
  }

  private async transactionQuery(sql: string, params: unknown[]) {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rowCount: 0, rows: [] };
    if (sql.includes("INSERT INTO playtest_evidence_sessions")) {
      const [sessionId, actorKey] = params as [string, string];
      const prior = this.sessions.get(sessionId);
      if (prior && prior !== actorKey) return { rowCount: 0, rows: [] };
      this.sessions.set(sessionId, actorKey);
      return { rowCount: 1, rows: [{ actor_key: actorKey }] };
    }
    if (sql.includes("INSERT INTO playtest_evidence_events")) {
      const [eventId, evidenceSessionId, actorKey, surface, event, occurredAt] =
        params;
      if (!this.events.some((row) => row.event_id === eventId)) {
        this.events.push({
          event_id: eventId,
          evidence_session_id: evidenceSessionId,
          actor_key: actorKey,
          surface,
          event_name: event,
          source: "human",
          occurred_at: occurredAt,
        });
      }
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("DELETE FROM playtest_evidence_events")) {
      const cutoff = (params[0] as Date).getTime();
      const retained = this.events.filter(
        (row) => (row.occurred_at as Date).getTime() >= cutoff,
      );
      this.events.splice(0, this.events.length, ...retained);
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes("DELETE FROM playtest_evidence_sessions")) {
      const activeSessions = new Set(
        this.events.map((row) => row.evidence_session_id as string),
      );
      for (const sessionId of this.sessions.keys()) {
        if (!activeSessions.has(sessionId)) this.sessions.delete(sessionId);
      }
      return { rowCount: 0, rows: [] };
    }
    throw new Error(`unexpected transaction query: ${sql}`);
  }
}
