import { describe, expect, it } from "vitest";
import { buildGameLoopHealthSnapshot } from "../../src/server/GameLoopHealth";

describe("GameManager health watermark", () => {
  it("reports the process-local loop healthy only inside its freshness budget", () => {
    expect(buildGameLoopHealthSnapshot(10_000, 12_000, 3_500)).toMatchObject({
      scope: "process-local-worker",
      healthy: true,
      ageMs: 2_000,
      maxAgeMs: 3_500,
    });
    expect(buildGameLoopHealthSnapshot(10_000, 14_001, 3_500)).toMatchObject({
      healthy: false,
      ageMs: 4_001,
    });
  });
});
