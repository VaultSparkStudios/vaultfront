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

describe("public protocol compatibility", () => {
  it("parses compact public task bullets and human-blocked tasks", async () => {
    const { parseHumanItems, parseUnifiedItems } =
      await import("../../scripts/lib/task-board.mjs");
    const board = [
      "## Unified Genius List (Session 73)",
      "",
      "- [done] 🔥 feedback_loop / automation · 20m · Alpha evidence — verified",
      "- [human-blocked] ⚠ launch · manual · Real playtest — requires people",
    ].join("\n");

    expect(parseUnifiedItems(board)).toMatchObject([
      { status: "done", tier: "🔥", effort: "20m", title: "Alpha evidence" },
      {
        status: "human-blocked",
        tier: "⚠",
        effort: "manual",
        title: "Real playtest",
      },
    ]);
    expect(parseHumanItems(board)[0].title).toBe("Real playtest");
  });

  it("extracts the labeled intent used by current public handoffs", async () => {
    const { extractCurrentSessionIntent } =
      await import("../../scripts/lib/task-board.mjs");
    expect(
      extractCurrentSessionIntent(
        "# Handoff\n\n## Where We Left Off — today\n\n**Session Intent:** Ship the recovery arc.\n",
      ),
    ).toBe("Ship the recovery arc.");
  });

  it("classifies lint-staged residue without treating it as committed work", async () => {
    const { classifyRecovery } =
      await import("../../scripts/classify-recovery-provenance.mjs");
    const result = classifyRecovery({
      status: [
        { status: " M", path: "prompts/start.md" },
        { status: "??", path: "src/new.ts" },
      ],
      stashes: "stash@{0} On main: lint-staged automatic backup",
      markerFiles: [],
    });

    expect(result.ok).toBe(true);
    expect(result.lintStagedBackups).toHaveLength(1);
    expect(result.counts).toMatchObject({
      "propagated-protocol": 1,
      "current-work": 1,
    });
  });

  it("treats unresolved merge markers as corruption", async () => {
    const { classifyRecovery } =
      await import("../../scripts/classify-recovery-provenance.mjs");
    const result = classifyRecovery({
      status: [],
      markerFiles: ["prompts/start.md"],
    });
    expect(result).toMatchObject({
      ok: false,
      corrupt: true,
      unresolvedMergeMarkers: ["prompts/start.md"],
    });
  });
});
