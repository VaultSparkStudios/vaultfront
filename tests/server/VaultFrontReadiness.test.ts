import { describe, expect, it } from "vitest";
import { buildVaultFrontReadiness } from "../../src/server/VaultFrontReadiness";

describe("buildVaultFrontReadiness", () => {
  it("returns a ready launch contract when the process is healthy", () => {
    const payload = buildVaultFrontReadiness({
      healthy: true,
      processRole: "master",
    });

    expect(payload.project).toBe("vaultfront");
    expect(payload.status).toBe("ready");
    expect(payload.checks.serverHealth).toBe("pass");
    expect(payload.testSurfaces.length).toBeGreaterThanOrEqual(4);
    expect(
      payload.launchGates.some((gate) => gate.gate === "revenue-signal"),
    ).toBe(true);
    expect(payload.checks.playtestPulse).toBe("warn");
  });

  it("marks the server health check failed when the process is degraded", () => {
    const payload = buildVaultFrontReadiness({
      healthy: false,
      processRole: "worker",
      workerId: 2,
    });

    expect(payload.status).toBe("degraded");
    expect(payload.workerId).toBe(2);
    expect(payload.checks.serverHealth).toBe("fail");
  });

  it("passes the playtest pulse gate when recent alpha signal is attached", () => {
    const payload = buildVaultFrontReadiness({
      healthy: true,
      processRole: "worker",
      workerId: 1,
      playtestPulse: {
        status: "ready",
        score: 64,
        freshness: {
          lastEventAt: "2026-06-03T20:00:00.000Z",
          ageMinutes: 2,
        },
      },
    });

    expect(payload.checks.playtestPulse).toBe("pass");
    expect(payload.playtestPulse?.score).toBe(64);
    expect(
      payload.launchGates.find((gate) => gate.gate === "playtest-pulse")
        ?.evidence,
    ).toContain("score 64");
  });
});
