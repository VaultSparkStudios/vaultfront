import { describe, expect, it } from "vitest";
import {
  buildReleaseEvidence,
  canonicalReleaseGateDefinitions,
  evaluateCanonicalReleaseGates,
  generateReleaseEvidence,
  verifyReleaseEvidenceLineage,
} from "../../scripts/generate-release-evidence.mjs";

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
    expect(verifyReleaseEvidenceLineage(clean)).toBe(true);
    expect(clean.status).toBe("blocked");
    expect(clean.launch.gates).toHaveLength(
      canonicalReleaseGateDefinitions.length,
    );
    expect(dirty.source.dirty).toBe(true);
    expect(dirty.evidenceDigest).not.toBe(clean.evidenceDigest);
    const tampered = structuredClone(clean);
    tampered.work.exhausted = false;
    expect(verifyReleaseEvidenceLineage(tampered)).toBe(false);
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

  it("fails missing, stale, future, and provenance-free live gates closed", () => {
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    const evaluated = evaluateCanonicalReleaseGates(
      {
        staging: {
          status: "verified",
          observedAt: "2026-07-15T12:00:00.000Z",
          source: "staging-smoke",
          digest: `sha256:${"a".repeat(64)}`,
        },
        stagingParity: {
          status: "verified",
          observedAt: "2026-07-17T13:00:00.000Z",
          source: "parity-probe",
          digest: `sha256:${"b".repeat(64)}`,
        },
        contactEmail: {
          status: "verified",
          observedAt: "2026-07-17T11:00:00.000Z",
          source: "brevo-delivery",
          digest: "not-a-canonical-digest",
        },
      },
      { now },
    );

    expect(evaluated.status).toBe("blocked");
    expect(
      evaluated.gates.find((gate) => gate.gate === "staging"),
    ).toMatchObject({
      status: "block",
      freshness: { state: "stale" },
    });
    expect(
      evaluated.gates.find((gate) => gate.gate === "stagingParity"),
    ).toMatchObject({ status: "block", freshness: { state: "future" } });
    expect(
      evaluated.gates.find((gate) => gate.gate === "contactEmail")?.detail,
    ).toContain("canonical sha256 digest");
    expect(
      evaluated.gates.find((gate) => gate.gate === "founderApproval"),
    ).toMatchObject({ status: "block", evidenceStatus: "missing" });
  });

  it("becomes ready only with every fresh sourced gate and executable local health", () => {
    const generatedAt = "2026-07-17T12:00:00.000Z";
    const releaseObservations = Object.fromEntries(
      canonicalReleaseGateDefinitions.map(([gate], index) => [
        gate,
        {
          status: "verified",
          observedAt: "2026-07-17T11:30:00.000Z",
          source: `probe:${gate}`,
          digest: `sha256:${index.toString(16).padStart(64, "0")}`,
        },
      ]),
    );
    const evidence = buildReleaseEvidence({
      generatedAt,
      gitSha: "abc123",
      dirty: false,
      auditSource: "docs/AUDIT_2026-07-16.json",
      auditItems: [{ slug: "done", status: "shipped" }],
      innovationItems: [{ id: "innovation", status: "shipped" }],
      transfer,
      releaseObservations,
      localSurfaceEvidence: {
        healthEndpoint: {
          status: "pass",
          source: "Master.ts + Worker.ts",
          observedAt: generatedAt,
          digest: `sha256:${"f".repeat(64)}`,
          detail: "Both routes declared.",
        },
      },
    });

    expect(evidence).toMatchObject({
      status: "ready",
      blockers: [],
      launch: { status: "ready" },
    });
  });

  it("the live generator reports blocked when external proof is absent", () => {
    const { evidence } = generateReleaseEvidence(process.cwd());
    expect(evidence.status).toBe("blocked");
    expect(evidence.launch.status).toBe("blocked");
    expect(evidence.source.observationBundle.state).toBe("missing");
    expect(evidence.launch.gates).toContainEqual(
      expect.objectContaining({
        gate: "founderApproval",
        status: "block",
        evidenceStatus: "missing",
      }),
    );
    expect(evidence.launch.gates).toContainEqual(
      expect.objectContaining({ gate: "footerManifest", status: "pass" }),
    );
  }, 15_000);
});
