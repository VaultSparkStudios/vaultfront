import { describe, expect, it } from "vitest";
import {
  canonicalReleaseGateNames,
  evaluateCanonicalReleaseEvidence,
} from "../../src/server/ReleaseEvidenceContract";

describe("canonical release evidence", () => {
  const now = Date.parse("2026-07-16T12:00:00.000Z");

  it("fails closed when external or alpha evidence is absent", () => {
    const evidence = evaluateCanonicalReleaseEvidence({ now });
    expect(evidence.status).toBe("blocked");
    expect(evidence.gates).toHaveLength(canonicalReleaseGateNames.length + 1);
    expect(evidence.blockers).toHaveLength(
      canonicalReleaseGateNames.length + 1,
    );
  });

  it("rejects stale and provenance-free verified labels", () => {
    const evidence = evaluateCanonicalReleaseEvidence({
      now,
      alphaGateStatus: "ready",
      observations: {
        staging: {
          status: "verified",
          observedAt: "2026-07-10T12:00:00.000Z",
          source: "staging-smoke",
          digest: "sha256:old",
        },
        footerManifest: {
          status: "verified",
          observedAt: "2026-07-16T11:00:00.000Z",
        },
      },
    });
    expect(
      evidence.gates.find((gate) => gate.gate === "staging")?.detail,
    ).toContain("fresh timestamp");
    expect(
      evidence.gates.find((gate) => gate.gate === "footerManifest")?.detail,
    ).toContain("source or digest");
  });

  it("becomes ready only when every named gate has fresh sourced evidence", () => {
    const observations = Object.fromEntries(
      canonicalReleaseGateNames.map((gate) => [
        gate,
        {
          status: "verified" as const,
          observedAt: "2026-07-16T11:30:00.000Z",
          source: `probe:${gate}`,
          digest: `sha256:${gate}`,
        },
      ]),
    );
    expect(
      evaluateCanonicalReleaseEvidence({
        now,
        alphaGateStatus: "ready",
        observations,
      }),
    ).toMatchObject({ status: "ready", blockers: [] });
  });
});
