import { describe, expect, it } from "vitest";
import {
  matchesGlob,
  parseByteLimit,
} from "../../scripts/check-bundle-budget.mjs";

describe("dependency-free bundle budget", () => {
  it("parses binary kilobyte and megabyte limits", () => {
    expect(parseByteLimit("500 kB")).toBe(500 * 1024);
    expect(parseByteLimit("1.8 MB")).toBe(1.8 * 1024 * 1024);
    expect(() => parseByteLimit("500")).toThrow("Invalid bundle limit");
  });

  it("matches the single-star artifact patterns used by the budget", () => {
    expect(
      matchesGlob("static/assets/index-abc.js", "static/assets/index-*.js"),
    ).toBe(true);
    expect(
      matchesGlob("static/assets/vendor-abc.js", "static/assets/index-*.js"),
    ).toBe(false);
  });
});
