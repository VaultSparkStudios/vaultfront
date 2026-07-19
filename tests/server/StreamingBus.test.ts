import { EventEmitter } from "events";
import { describe, expect, test, vi } from "vitest";
import { StreamingBus } from "../../src/server/StreamingBus";

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

describe("StreamingBus", () => {
  test("replays recent stream events to reconnecting overlays", () => {
    const bus = new StreamingBus();
    const first = response();
    bus.subscribe("game-1", first, "ip:first");

    bus.pushSnapshot({
      gameId: "game-1",
      tick: 10,
      activity: "vault_captured",
    });
    bus.pushCommentary("game-1", "Blue commander breaks the line.");

    const second = response();
    bus.subscribe("game-1", second, "ip:second");

    const writes = second.write.mock.calls
      .map(([line]: [string]) => line)
      .join("");
    expect(writes).toContain('"type":"snapshot"');
    expect(writes).toContain('"type":"replay"');
    expect(writes).toContain("Blue commander breaks the line.");
    expect(bus.debugState("game-1").recentEvents).toBe(2);
    bus.closeGame("game-1");
  });
});
