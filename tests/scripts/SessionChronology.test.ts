import { describe, expect, it } from "vitest";
import {
  averageLatestTotals,
  freshestIsoDate,
  isIsoCalendarDate,
} from "../../scripts/lib/session-chronology.mjs";
import { validateStartupBrief } from "../../scripts/validate-brief-format.mjs";

describe("session chronology", () => {
  it("accepts only real ISO calendar dates", () => {
    expect(isIsoCalendarDate("2026-07-21")).toBe(true);
    expect(isIsoCalendarDate("2026-02-30")).toBe(false);
    expect(isIsoCalendarDate(77)).toBe(false);
  });

  it("selects the freshest date without admitting numeric session ids", () => {
    expect(
      freshestIsoDate(["2026-07-19", 77, "2026-07-21", "not-a-date"]),
    ).toBe("2026-07-21");
  });

  it("derives Avg3 from the newest scored session totals", () => {
    expect(averageLatestTotals([997, undefined, 985, 959, 1000])).toBe(980.3);
  });

  it("rejects implausible rendered activity ages", () => {
    const result = validateStartupBrief(
      "Last active: 20654d " + "╔╗╚╝║═╠╣".repeat(6),
    );
    expect(result.semanticContradictions).toContain(
      "Last active reports 20654 days; reject likely non-date chronology input.",
    );
  });
});
