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
    expect(payload.checks.revenueSignal).toBe("warn");
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
        actionInsights: [
          "Pulse is broad enough for this alpha gate; continue with a focused rivalry/rematch playtest.",
        ],
        alphaGate: {
          status: "ready",
          passLabel: "Alpha gate passed.",
          nextCheck: "Alpha gate evidence is complete.",
        },
      },
    });

    expect(payload.checks.playtestPulse).toBe("pass");
    expect(payload.playtestPulse?.score).toBe(64);
    expect(
      payload.launchGates.find((gate) => gate.gate === "playtest-pulse")
        ?.evidence,
    ).toContain("alpha gate ready");
  });

  it("warns when pulse score is ready but alpha gate evidence is incomplete", () => {
    const payload = buildVaultFrontReadiness({
      healthy: true,
      processRole: "worker",
      workerId: 1,
      playtestPulse: {
        status: "ready",
        score: 64,
        freshness: {
          lastEventAt: "2026-06-13T20:00:00.000Z",
          ageMinutes: 2,
        },
        alphaGate: {
          status: "warming",
          passLabel: "4/5 alpha gate checks passing.",
          nextCheck: "Drive Rival Challenge action rate to 25%+.",
        },
      },
    });

    expect(payload.checks.playtestPulse).toBe("warn");
    expect(
      payload.launchGates.find((gate) => gate.gate === "playtest-pulse")
        ?.evidence,
    ).toContain("Drive Rival Challenge action rate");
  });

  it("passes the revenue signal gate when live supporter evidence is supplied", () => {
    const payload = buildVaultFrontReadiness({
      healthy: true,
      processRole: "master",
      revenueSignal: {
        status: "observed",
        observedAt: "2026-06-05T14:00:00.000Z",
      },
    });

    expect(payload.checks.revenueSignal).toBe("pass");
    expect(
      payload.launchGates.find((gate) => gate.gate === "revenue-signal")
        ?.evidence,
    ).toContain("2026-06-05T14:00:00.000Z");
  });
});
