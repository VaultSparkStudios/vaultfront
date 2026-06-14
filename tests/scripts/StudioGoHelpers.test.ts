import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
    expect(payload.ignisSource).toBe("fallback");
    expect(payload.items.length).toBeGreaterThanOrEqual(3);
    expect(
      payload.items.some((item: { status: string }) => item.status === "done"),
    ).toBe(true);
    expect(
      payload.items.some(
        (item: { title: string; status: string }) =>
          item.title.includes("Manual rivalry") &&
          item.status === "human-blocked",
      ),
    ).toBe(true);
    expect(
      payload.items.some(
        (item: { title: string; status: string }) =>
          item.title.includes("checkout") && item.status === "human-blocked",
      ),
    ).toBe(true);
  });

  it("does not mark done items as blocked in the JSON contract", () => {
    const result = runNode(["scripts/generate-genius-list.mjs", "--json"]);
    const payload = JSON.parse(result.stdout);
    const doneItems = payload.items.filter(
      (item: { status: string }) => item.status === "done",
    );

    expect(doneItems.length).toBeGreaterThan(0);
    expect(
      doneItems.every((item: { blocked: boolean }) => item.blocked === false),
    ).toBe(true);
  });
});
