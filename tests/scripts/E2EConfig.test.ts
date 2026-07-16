import { describe, expect, it } from "vitest";
import { normalizeE2EBaseUrl } from "../../e2e/playwright.config";

describe("Playwright base URL policy", () => {
  it("treats missing and blank CI variables as local-server mode", () => {
    expect(normalizeE2EBaseUrl(undefined)).toBeUndefined();
    expect(normalizeE2EBaseUrl("")).toBeUndefined();
    expect(normalizeE2EBaseUrl("   ")).toBeUndefined();
  });

  it("retains an explicitly configured remote base URL", () => {
    expect(normalizeE2EBaseUrl(" https://example.test/ ")).toBe(
      "https://example.test/",
    );
  });
});
