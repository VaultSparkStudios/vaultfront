import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendExecution,
  mergeAudit,
} from "../../scripts/lib/audit-sidecar.mjs";
import { spawnSync } from "../../scripts/lib/safe-spawn.mjs";

const tempDirs: string[] = [];
const script = path.resolve(__dirname, "../../scripts/render-audit-md.mjs");

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("audit sidecar renderer", () => {
  it("derives Markdown, ladders, and execution evidence from JSON", () => {
    const root = path.join(os.tmpdir(), `vaultfront-audit-${Date.now()}`);
    const docs = path.join(root, "docs");
    mkdirSync(docs, { recursive: true });
    tempDirs.push(root);
    writeFileSync(
      path.join(docs, "AUDIT_2099-01-02.json"),
      JSON.stringify({
        project: { name: "Demo" },
        items: [
          {
            id: 1,
            slug: "truth",
            tier: "🔥",
            axis: "process",
            effortHours: 2,
            impact: 9,
            innovation: 8,
            priority: 12.5,
            title: "Truth",
            why: "Evidence matters",
            recipe: "Render it",
            status: "shipped",
            ladder: { L2: { recipe: "Solid" } },
            executionLog: [
              {
                at: "2099-01-02T00:00:00Z",
                status: "shipped",
                note: "tested",
              },
            ],
          },
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [script, "--date", "2099-01-02"],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    const markdown = readFileSync(
      path.join(docs, "AUDIT_2099-01-02.md"),
      "utf8",
    );
    expect(markdown).toContain("Project Audit — Demo");
    expect(markdown).toContain("## Depth Ladder");
    expect(markdown).toContain("## Execution Log");
    expect(markdown).toContain("tested");
  });

  it("preserves shipped evidence while merging a refreshed audit", () => {
    const existing = {
      items: [
        {
          slug: "truth",
          status: "shipped",
          executionLog: [{ status: "shipped", note: "proved" }],
        },
      ],
    };
    const merged = mergeAudit(existing, {
      items: [{ slug: "truth", status: "pending", title: "Refreshed" }],
    });
    expect(merged.items[0]).toMatchObject({
      slug: "truth",
      status: "shipped",
      title: "Refreshed",
      executionLog: [{ status: "shipped", note: "proved" }],
    });
    expect(
      appendExecution(merged, "truth", {
        status: "shipped",
        note: "proved again",
      }),
    ).not.toBeNull();
    expect(merged.items[0].executionLog).toHaveLength(2);
  });
});
