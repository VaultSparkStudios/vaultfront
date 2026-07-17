import { describe, expect, it } from "vitest";
import { buildReleaseEvidence } from "../../scripts/generate-release-evidence.mjs";

const transfer = {
  initial: {
    gzipBytes: 90,
    brotliBytes: 80,
    maxGzipBytes: 100,
    maxBrotliBytes: 100,
  },
  media: {
    totalBytes: 900,
    largestBytes: 300,
    maxTotalBytes: 1_000,
    maxFileBytes: 400,
  },
};

describe("Release Evidence Manifest", () => {
  it("binds clean/dirty provenance and exhausted work into the digest", () => {
    const base = {
      generatedAt: "2026-07-17T01:00:00.000Z",
      gitSha: "abc123",
      dirty: false,
      auditSource: "docs/AUDIT_2026-07-16.json",
      auditItems: [{ slug: "done", status: "shipped" }],
      innovationItems: [{ id: "innovation", status: "shipped" }],
      transfer,
    };
    const clean = buildReleaseEvidence(base);
    const dirty = buildReleaseEvidence({ ...base, dirty: true });

    expect(clean.work.exhausted).toBe(true);
    expect(clean.transfer.status).toBe("pass");
    expect(clean.source.dirty).toBe(false);
    expect(dirty.source.dirty).toBe(true);
    expect(dirty.evidenceDigest).not.toBe(clean.evidenceDigest);
  });

  it("keeps pending work and over-budget transfer evidence red", () => {
    const evidence = buildReleaseEvidence({
      generatedAt: "2026-07-17T01:00:00.000Z",
      gitSha: "abc123",
      dirty: false,
      auditSource: "docs/AUDIT_2026-07-16.json",
      auditItems: [{ slug: "pending-audit", status: "pending" }],
      innovationItems: [],
      transfer: {
        ...transfer,
        initial: { ...transfer.initial, gzipBytes: 101 },
      },
    });

    expect(evidence.work.exhausted).toBe(false);
    expect(evidence.work.pendingWork).toEqual(["pending-audit"]);
    expect(evidence.transfer.status).toBe("fail");
  });
});
