import { describe, expect, it } from "vitest";
import { ExperimentIntegrityGate } from "../../src/server/ExperimentIntegrity";

describe("ExperimentIntegrityGate", () => {
  it("accepts one unit-weight event with matching server assignment", () => {
    const gate = new ExperimentIntegrityGate();
    expect(
      gate.check({
        eventId: "event-0000000001",
        value: 1,
        serverVariants: ["top"],
        clientVariants: ["top"],
      }),
    ).toEqual({ ok: true });
    expect(gate.snapshot()).toMatchObject({ accepted: 1, rejected: 0 });
  });

  it("rejects replayed IDs, amplified weights, and variant spoofing", () => {
    const gate = new ExperimentIntegrityGate();
    const base = {
      eventId: "event-0000000002",
      value: 1,
      serverVariants: ["top"],
      clientVariants: ["top"],
    } as const;
    expect(gate.check(base)).toEqual({ ok: true });
    expect(gate.check(base)).toEqual({ ok: false, reason: "duplicate-event" });
    expect(
      gate.check({ ...base, eventId: "event-0000000003", value: 2 }),
    ).toEqual({ ok: false, reason: "invalid-weight" });
    expect(
      gate.check({
        ...base,
        eventId: "event-0000000004",
        clientVariants: ["stack"],
      }),
    ).toEqual({ ok: false, reason: "variant-mismatch" });
    expect(gate.snapshot()).toMatchObject({
      accepted: 1,
      rejected: 3,
      rejectedByReason: {
        "duplicate-event": 1,
        "invalid-weight": 1,
        "variant-mismatch": 1,
      },
    });
  });

  it("bounds idempotency memory without changing aggregate counts", () => {
    const gate = new ExperimentIntegrityGate(2);
    for (let index = 0; index < 3; index++) {
      expect(
        gate.check({
          eventId: `event-000000000${index}`,
          value: 1,
          serverVariants: ["control", "default"],
        }),
      ).toEqual({ ok: true });
    }
    expect(gate.snapshot()).toMatchObject({ accepted: 3, trackedEventIds: 2 });
  });
});
