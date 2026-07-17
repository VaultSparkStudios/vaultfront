import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { SpectatorBus } from "../../src/server/SpectatorBus";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

class FakeWebSocket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  send = vi.fn();
  close = vi.fn();

  asWebSocket(): WebSocket {
    return this as unknown as WebSocket;
  }
}

describe("SpectatorBus admission and backpressure", () => {
  it("enforces per-game and per-worker membership caps", () => {
    const bus = new SpectatorBus({
      maxSpectatorsPerGame: 2,
      maxSpectatorsPerWorker: 2,
    });
    const first = new FakeWebSocket();
    const second = new FakeWebSocket();
    const overflow = new FakeWebSocket();

    expect(bus.join("game-a", first.asWebSocket())).toBe(true);
    expect(bus.join("game-a", second.asWebSocket())).toBe(true);
    expect(bus.join("game-a", overflow.asWebSocket())).toBe(false);
    expect(bus.join("game-b", overflow.asWebSocket())).toBe(false);
    expect(bus.spectatorCount("game-a")).toBe(2);
    expect(bus.workerSpectatorCount()).toBe(2);

    first.emit("close");
    expect(bus.workerSpectatorCount()).toBe(1);
    expect(bus.join("game-b", overflow.asWebSocket())).toBe(true);
    expect(bus.spectatorCount("game-b")).toBe(1);
  });

  it("closes and removes slow consumers before sending more data", () => {
    const bus = new SpectatorBus({ maxBufferedBytes: 10 });
    const slow = new FakeWebSocket();
    slow.bufferedAmount = 11;
    expect(bus.join("game-a", slow.asWebSocket())).toBe(true);

    bus.broadcast("game-a", Buffer.from("turn"));

    expect(slow.send).not.toHaveBeenCalled();
    expect(slow.close).toHaveBeenCalledWith(1013, "Spectator is too slow");
    expect(bus.spectatorCount("game-a")).toBe(0);
    expect(bus.workerSpectatorCount()).toBe(0);
  });
});
