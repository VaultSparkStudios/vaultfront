import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkTileBudgets,
  enforceTileBudgets,
  validateStartupBrief,
} from "../../scripts/validate-brief-format.mjs";

const root = path.resolve(__dirname, "../..");
const tempDirs: string[] = [];

function tempSecretsDir() {
  const dir = path.join(
    os.tmpdir(),
    `vaultfront-secrets-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function runCheckSecrets(args: string[], secretsDir: string) {
  return spawnSync(process.execPath, ["scripts/check-secrets.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      VAULTSPARK_SECRETS_DIR_OVERRIDE: secretsDir,
      STUDIO_OPS_SECRETS_DIR: path.join(secretsDir, "__missing_studio_ops__"),
    },
  });
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Studio protocol helper regressions", () => {
  it("fails stale startup briefs even when required boxes are present", () => {
    const body = [
      "<!-- brief-coherent: false -->",
      "╔══ SCORE ═══════════════════════════════════════════════════════╗",
      "║ ok                                                           ║",
      "╚═══════════════════════════════════════════════════════════════╝",
      "╔══ SIGNALS ═════════════════════════════════════════════════════╗",
      "║ ok                                                           ║",
      "╚═══════════════════════════════════════════════════════════════╝",
      "╔══ WHERE WE LEFT OFF ═══════════════════════════════════════════╗",
      "║ ok                                                           ║",
      "╚═══════════════════════════════════════════════════════════════╝",
      "╔══ GENIUS HIT LIST ═════════════════════════════════════════════╗",
      "║ ok                                                           ║",
      "╚═══════════════════════════════════════════════════════════════╝",
    ].join("\n");

    const result = validateStartupBrief(body);

    expect(result.ok).toBe(false);
    expect(result.staleBrief).toContain("brief-coherent: false");
  });

  it("attributes oversized brief tiles and trims them explicitly", () => {
    const hugeTile = [
      "╔══ GENIUS HIT LIST ═════════════════════════════════════════════╗",
      ...Array.from(
        { length: 140 },
        (_, idx) =>
          `║  #${idx.toString().padStart(3, "0")} ${"x".repeat(80)}  ║`,
      ),
      "╚═══════════════════════════════════════════════════════════════╝",
    ].join("\n");

    const before = checkTileBudgets(hugeTile);
    const { body, trimmed } = enforceTileBudgets(hugeTile);
    const after = checkTileBudgets(body);

    expect(before.overBudget[0].title).toBe("GENIUS HIT LIST");
    expect(trimmed[0].title).toBe("GENIUS HIT LIST");
    expect(body).toContain("trimmed (tile budget");
    expect(after.overBudget).toHaveLength(0);
  });

  it("resolves capability readiness from the secrets gateway override", () => {
    const secretsDir = tempSecretsDir();
    writeFileSync(
      path.join(secretsDir, "CAPABILITY_MAP.json"),
      JSON.stringify(
        {
          capabilities: {
            "demo.ready": { env: ["DEMO_SECRET"] },
            "demo.missing": { env: ["MISSING_SECRET"] },
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(secretsDir, "demo.env"),
      "DEMO_SECRET=ready-value-123\n",
    );

    const ready = runCheckSecrets(
      ["--for", "demo.ready", "--json"],
      secretsDir,
    );
    const missing = runCheckSecrets(
      ["--for", "demo.missing", "--json"],
      secretsDir,
    );

    expect(ready.status).toBe(0);
    expect(JSON.parse(ready.stdout)[0]).toMatchObject({
      capability: "demo.ready",
      ok: true,
      found: ["DEMO_SECRET"],
    });
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout)[0]).toMatchObject({
      capability: "demo.missing",
      ok: false,
      missing: ["MISSING_SECRET"],
    });
  });
});
