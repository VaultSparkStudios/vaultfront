import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkThemeProofReceipt } from "../../scripts/check-theme-proof-receipt.mjs";

const fixtures: string[] = [];
afterEach(() => {
  while (fixtures.length)
    fs.rmSync(fixtures.pop()!, { recursive: true, force: true });
});

function fixture(receipt: object) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "vaultfront-theme-proof-"),
  );
  fixtures.push(root);
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(
    path.join(root, "docs", "THEME_LOCAL_PROOF.json"),
    JSON.stringify(receipt),
  );
  return root;
}

function valid(now: number) {
  const result = (theme: string) => ({
    theme,
    surfaces: ["play", "settings"],
    ratios: { text: 7, muted: 4.5 },
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    scope: "local-only",
    matrix: ["chromium", "mobile-chrome"].map((project) => ({
      project,
      localOnly: true,
      results: ["vaultfront", "light", "competitive"].map(result),
    })),
  };
}

describe("local theme proof receipt", () => {
  it("accepts a complete fresh six-cell matrix", () => {
    const now = Date.UTC(2026, 6, 21);
    expect(checkThemeProofReceipt(fixture(valid(now)), now)).toMatchObject({
      ok: true,
      scope: "local-only",
      matrixCells: 6,
      errors: [],
    });
  });

  it("fails stale, live-claiming, and low-contrast receipts", () => {
    const now = Date.UTC(2026, 6, 21);
    const receipt = valid(now - 31 * 86_400_000) as any;
    receipt.scope = "staging";
    receipt.matrix[0].results[0].ratios.text = 4.49;
    const report = checkThemeProofReceipt(fixture(receipt), now);
    expect(report.ok).toBe(false);
    expect(report.errors.join(" ")).toMatch(/local-only/);
    expect(report.errors.join(" ")).toMatch(/stale/);
    expect(report.errors.join(" ")).toMatch(/contrast/);
  });
});
