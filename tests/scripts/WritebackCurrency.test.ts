import { describe, expect, it } from "vitest";
import {
  evaluateWriteBackCurrency,
  isSubstantiveCommit,
} from "../../scripts/check-writeback-currency.mjs";

const anchor = {
  sha: "d4247f12",
  isoDate: "2026-09-30T22:34:54-04:00",
  subject: "chore(vaultfront): close session 113 release recheck",
  files: ["context/SELF_IMPROVEMENT_LOOP.md"],
};

describe("write-back currency after closeout", () => {
  it("treats a later generated closeout board as a receipt", () => {
    const board = {
      sha: "8364ccdd",
      isoDate: "2026-09-30T22:40:00-04:00",
      subject: "fix(vaultfront): format closeout board",
      files: ["docs/CLOSEOUT_STATUS_BOARD.md"],
    };
    expect(isSubstantiveCommit(board)).toBe(false);
    expect(
      evaluateWriteBackCurrency({
        commits: [board, anchor],
        nowMs: Date.parse("2026-10-01T16:00:00Z"),
      }).debtCount,
    ).toBe(0);
  });

  it("still detects code committed together with a generated board", () => {
    const mixed = {
      sha: "12345678",
      isoDate: "2026-09-30T22:40:00-04:00",
      subject: "fix(vaultfront): change game and board",
      files: ["docs/CLOSEOUT_STATUS_BOARD.md", "src/server/Worker.ts"],
    };
    expect(isSubstantiveCommit(mixed)).toBe(true);
    const result = evaluateWriteBackCurrency({
      commits: [mixed, anchor],
      nowMs: Date.parse("2026-10-01T16:00:00Z"),
    });
    expect(result.ok).toBe(false);
    expect(result.debtCount).toBe(1);
  });
});
