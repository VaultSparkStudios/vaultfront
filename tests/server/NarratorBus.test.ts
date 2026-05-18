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
  emitter.write = vi.fn();
  emitter.end = vi.fn();
  return emitter;
}

describe("NarratorBus", () => {
  test("deduplicates adjacent pending labels and caps queue length", () => {
    const oldKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    const bus = new NarratorBus();
    bus.subscribe("game-1", response());

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
  });
});
