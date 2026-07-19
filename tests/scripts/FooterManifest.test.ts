import { describe, expect, it } from "vitest";
import { checkFooterManifest } from "../../scripts/check-footer-manifest.mjs";

describe("public footer manifest", () => {
  it("proves navigation, ownership, copyright, and legal links on every leaf", () => {
    expect(checkFooterManifest(process.cwd())).toMatchObject({
      ok: true,
      pageCount: 10,
      errors: [],
    });
  });
});
