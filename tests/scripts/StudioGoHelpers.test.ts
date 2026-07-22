import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { spawnSync } from "../../scripts/lib/safe-spawn.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function runNode(args: string[]) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
  });
}

describe("Studio /go helper scripts", () => {
  it("generates a structured genius list with honest status semantics", () => {
    const result = runNode(["scripts/generate-genius-list.mjs", "--json"]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.project).toBe("vaultfront");
    expect(payload.ignisSource).toBe("latest-audit-sidecar");
    expect(payload.auditSource).toMatch(
      /^docs\/AUDIT_\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(payload.items.length).toBeGreaterThan(0);
    expect(
      payload.items.every(
        (item: { auditSource: string }) =>
          item.auditSource === payload.auditSource,
      ),
    ).toBe(true);
    expect(
      payload.items.every((item: { status: string }) =>
        [
          "unblocked",
          "externally-blocked",
          "in-progress",
          "done",
          "deferred",
        ].includes(item.status),
      ),
    ).toBe(true);
  });

  it("does not mark done items as blocked in the JSON contract", () => {
    const result = runNode(["scripts/generate-genius-list.mjs", "--json"]);
    const payload = JSON.parse(result.stdout);
    const doneItems = payload.items.filter(
      (item: { status: string }) => item.status === "done",
    );

    expect(
      doneItems.every((item: { blocked: boolean }) => item.blocked === false),
    ).toBe(true);
  });
});
