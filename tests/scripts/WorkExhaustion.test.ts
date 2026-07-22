import { describe, expect, it } from "vitest";
import {
  evaluateWorkExhaustion,
  pendingUnblocked,
} from "../../scripts/check-work-exhaustion.mjs";

describe("complete-all exhaustion proof", () => {
  it("fails with exact IDs for a pending audit or innovation item", () => {
    const report = evaluateWorkExhaustion({
      auditSource: "docs/AUDIT_2026-07-16.json",
      auditItems: [{ slug: "pending-audit", status: "pending" }],
      innovationSource: "docs/INNOVATION_PACK.json",
      innovationItems: [{ id: "pending-innovation", status: "pending" }],
    });

    expect(report.ok).toBe(false);
    expect(report.pendingUnblocked).toEqual([
      { source: "audit", id: "pending-audit" },
      { source: "innovation", id: "pending-innovation" },
    ]);
  });

  it("treats shipped work as exhausted and honest deferrals as non-actionable", () => {
    const items = [
      { id: "done", status: "shipped" },
      { id: "deferred", status: "deferred" },
      { id: "blocked", status: "human-blocked" },
      { id: "external", status: "externally-blocked" },
    ];
    expect(pendingUnblocked(items)).toEqual([]);
    expect(
      evaluateWorkExhaustion({ auditItems: items, innovationItems: items }).ok,
    ).toBe(true);
  });
});
