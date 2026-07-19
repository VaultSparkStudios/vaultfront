import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateProjectTruth } from "../../scripts/lib/project-truth.mjs";
import { spawnSync } from "../../scripts/lib/safe-spawn.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("truthful project doctor", () => {
  it("flags a public audience with exempt-internal fixture data", () => {
    const result = evaluateProjectTruth({
      status: {
        audience: "public-unlaunched",
        freeTierCostStatus: "exempt-internal",
      },
      canonAdoption: "| CANON-011 | Sitemap | exempt (internal) | |",
    });

    expect(result.ok).toBe(false);
    expect(result.contradictions).toHaveLength(2);
    expect(result.contradictions[0].id).toBe(
      "public-audience-internal-exemption",
    );
  });

  it("propagates a forced probe failure through JSON and the process exit", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/project-doctor.mjs",
        "--json",
        "--truth-only",
        "--force-failure",
      ],
      { cwd: root, encoding: "utf8" },
    );
    const payload = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(payload).toMatchObject({
      source: "scripts/project-doctor.mjs",
      blockingFailing: expect.any(Number),
      observedAt: expect.any(String),
      checks: expect.any(Array),
      warnings: expect.any(Array),
    });
    expect(payload.blockingFailing).toBeGreaterThanOrEqual(1);
    expect(payload.checks).toContainEqual(
      expect.objectContaining({
        id: "forced-failure",
        status: "fail",
        exitCode: 17,
      }),
    );
  });

  it("runs the truth probe against an isolated fixture root", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "vaultfront-truth-"));
    fs.mkdirSync(path.join(fixture, "context"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture, "context", "PROJECT_STATUS.json"),
      JSON.stringify({ audience: "internal" }),
    );
    fs.writeFileSync(
      path.join(fixture, "context", "CANON_ADOPTION.md"),
      "Audience: internal\n",
    );
    const result = spawnSync(
      process.execPath,
      [
        path.join(root, "scripts", "check-project-truth.mjs"),
        "--root",
        fixture,
        "--json",
      ],
      { cwd: root, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      audience: "internal",
      contradictions: [],
    });
  });
});
