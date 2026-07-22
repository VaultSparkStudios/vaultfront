import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generatePublicShell } from "../../scripts/generate-public-shell.mjs";
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
      projectTruth: {
        evaluation: { ok: true, contradictionIds: [] },
        fingerprint: `sha256:${"c".repeat(64)}`,
      },
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
    const truthTampered = structuredClone(clean);
    truthTampered.projectTruth.fingerprint = `sha256:${"d".repeat(64)}`;
    expect(verifyReleaseEvidenceLineage(truthTampered)).toBe(false);
    expect(clean.lineage.nodes).toContainEqual(
      expect.objectContaining({
        id: "project-truth",
        kind: "cross-surface-truth",
      }),
    );
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

  it("reports blocked without external proof in an isolated unbuilt fixture", () => {
    const fixture = fs.mkdtempSync(
      path.join(os.tmpdir(), "vaultfront-release-evidence-"),
    );
    try {
      fs.mkdirSync(path.join(fixture, "static", "assets"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(fixture, "src", "server"), { recursive: true });
      fs.mkdirSync(path.join(fixture, "public"), { recursive: true });
      fs.writeFileSync(
        path.join(fixture, ".bundlewatch.json"),
        JSON.stringify({
          initialEntry: {
            html: "static/index.html",
            baselineGzipBytes: 1_024,
            baselineBrotliBytes: 1_024,
            crossPlatformVariancePercent: 0,
          },
          media: {
            root: "static/assets",
            extensions: [".png"],
            maxTotalBytes: 1_024,
            maxFileBytes: 1_024,
          },
        }),
      );
      fs.writeFileSync(
        path.join(fixture, "static", "index.html"),
        "<!doctype html><html><head></head><body></body></html>",
      );
      for (const source of ["Master.ts", "Worker.ts"]) {
        fs.writeFileSync(
          path.join(fixture, "src", "server", source),
          'app.get("/_health", handler);\n',
        );
      }
      fs.writeFileSync(
        path.join(fixture, "public", "footer-manifest.json"),
        JSON.stringify({
          schemaVersion: 2,
          brandHref: "https://vaultsparkstudios.com",
          copyright: "© 2026 VaultSpark Studios LLC. All rights reserved.",
          headerLinks: [{ href: "/", label: "Play" }],
          footerLinks: [
            { href: "/", label: "Play" },
            { href: "/privacy/", label: "Privacy" },
            { href: "/terms/", label: "Terms" },
          ],
          footerOnly: ["/privacy/", "/terms/"],
          legalPages: ["/privacy/", "/terms/"],
          requiredLinks: ["/privacy/", "/terms/"],
          pages: [{ route: "/", source: "public/index.html" }],
        }),
      );
      fs.writeFileSync(
        path.join(fixture, "public", "index.html"),
        '<nav><a href="/">Play</a></nav><footer><a href="https://vaultsparkstudios.com">VaultSpark Studios</a><a href="/">Play</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a>© 2026 VaultSpark Studios LLC. All rights reserved.</footer>',
      );
      generatePublicShell(fixture, true);

      const { evidence } = generateReleaseEvidence(fixture);
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
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  }, 15_000);
});
