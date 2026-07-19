import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkCapabilityReachability } from "../../scripts/check-capability-reachability.mjs";

describe("agent capability reachability", () => {
  it("proves every advertised local capability while preserving launch truth", () => {
    const result = checkCapabilityReachability(process.cwd());
    expect(result).toMatchObject({
      ok: true,
      releasePosture: "implemented-local-unlaunched",
      publicRuntime: "unavailable",
      errors: [],
    });
    expect(result.capabilities).toHaveLength(6);
    expect(
      result.capabilities.every(
        (entry) => entry.status === "reachable-in-source",
      ),
    ).toBe(true);
    expect(result.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("fails closed when an agent-facing claim loses its implementation", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "vf-capability-"));
    fs.mkdirSync(path.join(fixture, "public"), { recursive: true });
    fs.mkdirSync(path.join(fixture, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture, "public", "agents.json"),
      JSON.stringify({
        availability: { publicRuntime: "unavailable" },
        endpoints: { capabilityManifest: "/capability-reachability.json" },
      }),
    );
    fs.writeFileSync(
      path.join(fixture, "src", "feature.ts"),
      "present-token\n",
    );
    fs.writeFileSync(
      path.join(fixture, "public", "capability-reachability.json"),
      JSON.stringify({
        schemaVersion: "1.0",
        releasePosture: "implemented-local-unlaunched",
        capabilities: Array.from({ length: 6 }, (_, index) => ({
          id: `capability-${index}`,
          audience: "agent",
          evidence: [
            {
              path: "src/feature.ts",
              includes: [index === 5 ? "missing-token" : "present-token"],
            },
          ],
        })),
      }),
    );
    const result = checkCapabilityReachability(fixture);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("missing-token"),
    );
  });
});
