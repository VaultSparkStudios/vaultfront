import { describe, expect, it } from "vitest";
import {
  buildEvidenceLineage,
  verifyEvidenceLineage,
} from "../../scripts/lib/evidence-lineage.mjs";

describe("evidence lineage DAG", () => {
  it("binds every decision to its ordered source receipts", () => {
    const lineage = buildEvidenceLineage([
      { id: "source", kind: "provenance", evidence: { sha: "abc" } },
      {
        id: "gate",
        kind: "gate",
        parents: ["source"],
        evidence: { status: "pass" },
      },
      {
        id: "decision",
        kind: "decision",
        parents: ["gate"],
        evidence: { status: "ready" },
      },
    ]);
    expect(
      verifyEvidenceLineage(lineage, {
        source: { sha: "abc" },
        gate: { status: "pass" },
        decision: { status: "ready" },
      }),
    ).toBe(true);
    expect(lineage.rootDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects tampered receipts, roots, and forward references", () => {
    const lineage = buildEvidenceLineage([
      { id: "source", evidence: { sha: "abc" } },
      { id: "decision", parents: ["source"], evidence: { ready: false } },
    ]);
    const tampered = structuredClone(lineage);
    tampered.nodes[0].contentDigest = `sha256:${"0".repeat(64)}`;
    expect(verifyEvidenceLineage(tampered)).toBe(false);
    expect(
      verifyEvidenceLineage(lineage, {
        source: { sha: "tampered" },
        decision: { ready: false },
      }),
    ).toBe(false);
    expect(() =>
      buildEvidenceLineage([
        { id: "decision", parents: ["source"], evidence: {} },
        { id: "source", evidence: {} },
      ]),
    ).toThrow(/forward-parent/);
  });
});
