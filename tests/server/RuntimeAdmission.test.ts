import { EventEmitter } from "events";
import { describe, expect, it, vi } from "vitest";
import { BoundedSseTransport } from "../../src/server/BoundedSseTransport";
import {
  GameCreationAdmissionGuard,
  gameAllocationDecision,
} from "../../src/server/GameCreationAdmission";
import { databaseAllowsRequest } from "../../src/server/db/pool";

vi.mock("../../src/server/Logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

function response(writeResult = true) {
  const emitter = new EventEmitter() as any;
  emitter.write = vi.fn().mockReturnValue(writeResult);
  emitter.end = vi.fn(() => emitter.emit("close"));
  return emitter;
}

describe("runtime admission guards", () => {
  it("enforces actor quota with a deterministic retry window", () => {
    let now = 1_000;
    const guard = new GameCreationAdmissionGuard(2, 10_000, 10, () => now);
    expect(guard.consume("actor:a")).toEqual({ allowed: true, remaining: 1 });
    expect(guard.consume("actor:a")).toEqual({ allowed: true, remaining: 0 });
    expect(guard.consume("actor:a")).toEqual({
      allowed: false,
      retryAfterMs: 10_000,
    });
    now += 10_000;
    expect(guard.consume("actor:a")).toEqual({ allowed: true, remaining: 1 });
  });

  it("rejects collisions before capacity and admits an available slot", () => {
    expect(gameAllocationDecision(true, 2, 2)).toBe("collision");
    expect(gameAllocationDecision(false, 2, 2)).toBe("capacity");
    expect(gameAllocationDecision(false, 1, 2)).toBe("allow");
  });

  it("blocks mutations but preserves diagnostics after configured database failure", () => {
    const failed = {
      configured: true,
      state: "failed" as const,
      observedAt: "2026-07-17T01:00:00.000Z",
      connectedAt: null,
      failureCode: "ConnectionError",
      fallbackAllowed: false,
      scope: "process-local-worker" as const,
    };
    expect(databaseAllowsRequest(failed, "POST")).toBe(false);
    expect(databaseAllowsRequest(failed, "DELETE")).toBe(false);
    expect(databaseAllowsRequest(failed, "GET")).toBe(true);
  });

  it("rejects capacity and evicts a slow SSE consumer when its queue fills", () => {
    vi.useFakeTimers();
    const transport = new BoundedSseTransport({
      maxSubscribersPerGame: 1,
      maxSubscribersPerWorker: 2,
      maxSubscribersPerIp: 1,
      maxQueuedEventsPerClient: 1,
      maxQueuedBytesPerClient: 32,
      drainTimeoutMs: 50,
    });
    const slow = response(false);
    expect(transport.subscribe("g1", "ip:1", slow, vi.fn())).toEqual({
      accepted: true,
    });
    expect(transport.admit("g1", "ip:2")).toEqual({
      accepted: false,
      reason: "game-capacity",
    });
    expect(transport.write(slow, "data: one\n\n")).toBe(true);
    expect(transport.write(slow, "data: two\n\n")).toBe(true);
    expect(transport.write(slow, "data: three\n\n")).toBe(false);
    expect(transport.snapshot().counters.slowConsumerEvictions).toBe(1);
    expect(transport.snapshot().live.subscribers).toBe(0);
    vi.useRealTimers();
  });
});
