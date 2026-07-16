import { describe, expect, it } from "vitest";
import { comparePrettierBaseline } from "../../scripts/check-prettier-ratchet.mjs";

describe("Prettier shrink-only ratchet", () => {
  it("rejects new drift while allowing baseline improvements", () => {
    expect(
      comparePrettierBaseline(["legacy.ts", "new.ts"], ["legacy.ts"]),
    ).toEqual({
      regressions: ["new.ts"],
      improvements: [],
    });
    expect(comparePrettierBaseline([], ["legacy.ts"])).toEqual({
      regressions: [],
      improvements: ["legacy.ts"],
    });
  });
});
