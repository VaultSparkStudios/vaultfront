import { EventEmitter } from "events";
import { describe, expect, test, vi } from "vitest";
import { NarratorBus } from "../../src/server/NarratorBus";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

function response() {
  const emitter = new EventEmitter() as any;
  emitter.write = vi.fn().mockReturnValue(true);
  emitter.end = vi.fn();
  return emitter;
}

describe("NarratorBus", () => {
  test("deduplicates adjacent pending labels and caps queue length", () => {
    const oldKey = process.env.ANTHROPIC_API_KEY;
    const oldEnabled = process.env.VAULTFRONT_REMOTE_AI_ENABLED;
    const oldCap = process.env.VAULTFRONT_REMOTE_AI_MAX_CALLS_PER_HOUR;
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.VAULTFRONT_REMOTE_AI_ENABLED = "true";
    process.env.VAULTFRONT_REMOTE_AI_MAX_CALLS_PER_HOUR = "10";
    const bus = new NarratorBus();
    bus.subscribe("game-1", response(), "ip:test");

    bus.queueEvent("game-1", "convoy intercepted");
    bus.queueEvent("game-1", "convoy intercepted");
    for (let i = 0; i < 20; i++) {
      bus.queueEvent("game-1", `event ${i}`);
    }

    expect(bus.debugState("game-1").pendingEvents).toBe(12);
    bus.closeGame("game-1");
    if (oldKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = oldKey;
    }
    if (oldEnabled === undefined) {
      delete process.env.VAULTFRONT_REMOTE_AI_ENABLED;
    } else {
      process.env.VAULTFRONT_REMOTE_AI_ENABLED = oldEnabled;
    }
    if (oldCap === undefined) {
      delete process.env.VAULTFRONT_REMOTE_AI_MAX_CALLS_PER_HOUR;
    } else {
      process.env.VAULTFRONT_REMOTE_AI_MAX_CALLS_PER_HOUR = oldCap;
    }
  });
});
