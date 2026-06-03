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
});
