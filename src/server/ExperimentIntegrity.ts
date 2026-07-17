export type ExperimentIntegrityRejectReason =
  "duplicate-event" | "variant-mismatch" | "invalid-weight";

export interface ExperimentIntegritySnapshot {
  accepted: number;
  rejected: number;
  rejectedByReason: Record<ExperimentIntegrityRejectReason, number>;
  trackedEventIds: number;
}

export interface ExperimentEventCheck {
  eventId: string;
  value: number;
  serverVariants: readonly string[];
  clientVariants?: readonly (string | undefined)[];
}

export type ExperimentEventVerdict =
  { ok: true } | { ok: false; reason: ExperimentIntegrityRejectReason };

/**
 * Bounded, process-local integrity gate for decision-grade experiment events.
 * Assignment remains server-owned; callers may echo variants only as a
 * mismatch detector. Event IDs are idempotency keys, never evidence weights.
 */
export class ExperimentIntegrityGate {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];
  private accepted = 0;
  private readonly rejectedByReason: Record<
    ExperimentIntegrityRejectReason,
    number
  > = {
    "duplicate-event": 0,
    "variant-mismatch": 0,
    "invalid-weight": 0,
  };

  constructor(private readonly maxEventIds = 10_000) {}

  check(input: ExperimentEventCheck): ExperimentEventVerdict {
    if (input.value !== 1) return this.reject("invalid-weight");
    if (this.seen.has(input.eventId)) return this.reject("duplicate-event");

    const client = input.clientVariants ?? [];
    for (let index = 0; index < client.length; index++) {
      const echoed = client[index];
      if (echoed !== undefined && echoed !== input.serverVariants[index]) {
        return this.reject("variant-mismatch");
      }
    }

    this.seen.add(input.eventId);
    this.order.push(input.eventId);
    while (this.order.length > this.maxEventIds) {
      const evicted = this.order.shift();
      if (evicted !== undefined) this.seen.delete(evicted);
    }
    this.accepted += 1;
    return { ok: true };
  }

  snapshot(): ExperimentIntegritySnapshot {
    const rejected = Object.values(this.rejectedByReason).reduce(
      (sum, value) => sum + value,
      0,
    );
    return {
      accepted: this.accepted,
      rejected,
      rejectedByReason: { ...this.rejectedByReason },
      trackedEventIds: this.seen.size,
    };
  }

  private reject(
    reason: ExperimentIntegrityRejectReason,
  ): ExperimentEventVerdict {
    this.rejectedByReason[reason] += 1;
    return { ok: false, reason };
  }
}
