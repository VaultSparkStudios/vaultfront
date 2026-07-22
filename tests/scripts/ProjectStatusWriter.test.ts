import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  analyzeProjectStatusWriterSource,
  checkProjectStatusWriters,
} from "../../scripts/check-project-status-writers.mjs";
import {
  updateProjectStatus,
  writeProjectStatus,
} from "../../scripts/lib/write-project-status.mjs";

const roots: string[] = [];

function fixtureRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "vaultfront-status-writer-"),
  );
  roots.push(root);
  fs.mkdirSync(path.join(root, "context"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "context", "PROJECT_STATUS.json"),
    JSON.stringify({
      slug: "fixture",
      keepMe: "preserved",
      silMax: 500,
      silScore: 1,
      silCategoriesV3: {
        devHealth: 100,
        creativeAlignment: 100,
        momentum: 100,
        engagement: 90,
        processQuality: 100,
        crossRepoCoherence: 90,
        securityPosture: 100,
        ecosystemIntegration: 90,
        capitalEfficiency: 100,
        automationCoverage: 90,
      },
    }),
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("canonical project-status writer", () => {
  test("atomically preserves unrelated fields and enforces SIL invariants", () => {
    const root = fixtureRoot();
    updateProjectStatus(
      root,
      (current: Record<string, unknown>) => ({
        ...current,
        sessionMode: "founder",
      }),
      { touchLastUpdated: false },
    );

    const status = JSON.parse(
      fs.readFileSync(
        path.join(root, "context", "PROJECT_STATUS.json"),
        "utf8",
      ),
    );
    expect(status.keepMe).toBe("preserved");
    expect(status.sessionMode).toBe("founder");
    expect(status.silScore).toBe(960);
    expect(status.silMax).toBe(1000);
    expect(
      fs
        .readdirSync(path.join(root, "context"))
        .filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  test("writeProjectStatus rejects stale score claims by recomputing them", () => {
    const root = fixtureRoot();
    const result = writeProjectStatus(
      root,
      {
        silScore: 999,
        silMax: 500,
        silCategoriesV3: {
          devHealth: 10,
          creativeAlignment: 10,
          momentum: 10,
          engagement: 10,
          processQuality: 10,
          crossRepoCoherence: 10,
          securityPosture: 10,
          ecosystemIntegration: 10,
          capitalEfficiency: 10,
          automationCoverage: 10,
        },
      },
      { touchLastUpdated: false },
    );
    expect(
      result.violations.map((entry: { field: string }) => entry.field),
    ).toEqual(expect.arrayContaining(["silScore", "silMax"]));
    const status = JSON.parse(fs.readFileSync(result.written, "utf8"));
    expect(status.silScore).toBe(100);
    expect(status.silMax).toBe(1000);
  });

  test("taint-lite scan catches direct status writes without flagging reads", () => {
    expect(
      analyzeProjectStatusWriterSource(`
        const statusPath = path.join(root, "context", "PROJECT_STATUS.json");
        fs.writeFileSync(statusPath, JSON.stringify(status));
      `),
    ).toHaveLength(1);
    expect(
      analyzeProjectStatusWriterSource(`
        const statusPath = path.join(root, "context", "PROJECT_STATUS.json");
        const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
        updateProjectStatus(root, () => status);
      `),
    ).toHaveLength(0);
  });

  test("repository has no project-status writer bypass", () => {
    expect(checkProjectStatusWriters(process.cwd())).toEqual({
      ok: true,
      findings: [],
    });
  });
});
