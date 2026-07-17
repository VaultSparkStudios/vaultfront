import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  WebSocketIngressGuard,
  websocketIngressIp,
} from "../../src/server/WorkerLobbyService";

vi.mock("../../src/server/Logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("WebSocketIngressGuard", () => {
  it("enforces a fixed-window upgrade rate", () => {
    const guard = new WebSocketIngressGuard(2, 10, 1_000);
    const first = guard.reserve("203.0.113.10", 100);
    const second = guard.reserve("203.0.113.10", 200);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    if (first.allowed) first.release();
    if (second.allowed) second.release();

    expect(guard.reserve("203.0.113.10", 300)).toEqual({
      allowed: false,
      reason: "rate-limit",
    });
    expect(guard.reserve("203.0.113.10", 1_100).allowed).toBe(true);
  });

  it("caps active connections and releases reservations idempotently", () => {
    const guard = new WebSocketIngressGuard(10, 1, 1_000);
    const reservation = guard.reserve("203.0.113.11", 100);
    expect(reservation.allowed).toBe(true);
    expect(guard.activeForIp("203.0.113.11")).toBe(1);
    expect(guard.reserve("203.0.113.11", 200)).toEqual({
      allowed: false,
      reason: "connection-limit",
    });

    if (reservation.allowed) {
      reservation.release();
      reservation.release();
    }
    expect(guard.activeForIp("203.0.113.11")).toBe(0);
    expect(guard.reserve("203.0.113.11", 300).allowed).toBe(true);
  });
});

describe("websocketIngressIp", () => {
  function request(
    remoteAddress: string,
    headers: http.IncomingHttpHeaders,
  ): http.IncomingMessage {
    return {
      headers,
      socket: { remoteAddress },
    } as unknown as http.IncomingMessage;
  }

  it("ignores spoofable proxy headers from non-loopback peers", () => {
    expect(
      websocketIngressIp(
        request("198.51.100.22", {
          "x-forwarded-for": "203.0.113.99",
          "x-real-ip": "203.0.113.98",
        }),
      ),
    ).toBe("198.51.100.22");
  });

  it("accepts only valid proxy IPs from the local reverse proxy", () => {
    expect(
      websocketIngressIp(
        request("127.0.0.1", {
          "x-forwarded-for": "203.0.113.44, 127.0.0.1",
          "x-real-ip": "not-an-ip",
        }),
      ),
    ).toBe("203.0.113.44");
  });
});
