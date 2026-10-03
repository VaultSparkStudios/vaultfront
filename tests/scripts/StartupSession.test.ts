import { describe, expect, it } from "vitest";
import { resolveStartupSession } from "../../scripts/lib/startup-session.mjs";

describe("startup session allocation", () => {
  it("preserves an unscored recovery allocation without rewriting it backwards", () => {
    expect(resolveStartupSession(114, 115)).toEqual({
      nextSession: 116,
      closeoutSession: 114,
      shouldAdvanceStatus: false,
    });
  });

  it("advances a lagging status from the scored closeout", () => {
    expect(resolveStartupSession(115, 113)).toEqual({
      nextSession: 116,
      closeoutSession: 115,
      shouldAdvanceStatus: true,
    });
  });

  it("rejects malformed identities and retains the bootstrap fallback", () => {
    expect(resolveStartupSession(null, "115").nextSession).toBe(63);
    expect(resolveStartupSession(-1, 115).nextSession).toBe(116);
  });
});
