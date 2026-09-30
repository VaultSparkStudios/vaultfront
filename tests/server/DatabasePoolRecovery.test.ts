import { afterEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  outcomes: [] as Array<"ready" | "failed">,
  pools: [] as Array<{ fail: (error: Error) => void }>,
}));

vi.mock("pg", () => ({
  Pool: class {
    private onError: (error: Error) => void = () => undefined;

    constructor() {
      database.pools.push(this);
    }

    on(event: string, listener: (error: Error) => void) {
      if (event === "error") this.onError = listener;
      return this;
    }

    query() {
      return database.outcomes.shift() === "failed"
        ? Promise.reject(new Error("database unavailable"))
        : Promise.resolve({ rows: [{ one: 1 }] });
    }

    end() {
      return Promise.resolve();
    }

    fail(error: Error) {
      this.onError(error);
    }
  },
}));

vi.mock("../../src/server/Logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  database.outcomes.length = 0;
  database.pools.length = 0;
});

describe("database pool recovery", () => {
  it("fails closed through an outage and reconnects after the database returns", async () => {
    vi.useFakeTimers();
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    database.outcomes.push("failed", "ready", "ready");

    const module = await import("../../src/server/db/pool");
    await module.databaseReady;
    expect(module.getDatabasePosture().state).toBe("failed");
    expect(
      module.databaseAllowsRequest(module.getDatabasePosture(), "POST"),
    ).toBe(false);
    expect(
      module.databaseAllowsRequest(module.getDatabasePosture(), "GET"),
    ).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(module.getDatabasePosture().state).toBe("ready");
    expect(module.pool).toBe(database.pools[1]);

    database.pools[1].fail(new Error("connection dropped"));
    expect(module.getDatabasePosture().state).toBe("failed");
    expect(module.pool).toBeNull();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(module.getDatabasePosture().state).toBe("ready");
    expect(module.pool).toBe(database.pools[2]);
  });

  it("blocks writes while a configured database is still connecting", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const module = await import("../../src/server/db/pool");
    expect(
      module.databaseAllowsRequest(
        {
          configured: true,
          state: "connecting",
          observedAt: "2026-09-30T00:00:00.000Z",
          connectedAt: null,
          failureCode: null,
          fallbackAllowed: false,
          scope: "process-local-worker",
        },
        "POST",
      ),
    ).toBe(false);
  });
});
