import { describe, expect, it } from "vitest";
import { buildIpcHealthSnapshot } from "../../src/server/IpcHealth";

describe("IPC health watermark", () => {
  it("requires both a connected channel and a fresh master message", () => {
    expect(buildIpcHealthSnapshot(10_000, true, 11_500, 2_000)).toMatchObject({
      healthy: true,
      connected: true,
      ageMs: 1_500,
    });
    expect(buildIpcHealthSnapshot(10_000, true, 12_001, 2_000).healthy).toBe(
      false,
    );
    expect(buildIpcHealthSnapshot(10_000, false, 10_100, 2_000).healthy).toBe(
      false,
    );
  });
});
