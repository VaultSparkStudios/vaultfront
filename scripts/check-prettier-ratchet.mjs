#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "prettier-baseline.json");

export function comparePrettierBaseline(current, baseline) {
  const currentSet = new Set(current);
  const baselineSet = new Set(baseline);
  return {
    regressions: [...currentSet]
      .filter((file) => !baselineSet.has(file))
      .sort(),
    improvements: [...baselineSet]
      .filter((file) => !currentSet.has(file))
      .sort(),
  };
}

function listDifferent() {
  const cli = path.join(
    root,
    "node_modules",
    "prettier",
    "bin",
    "prettier.cjs",
  );
  const result = spawnSync(process.execPath, [cli, "--list-different", "."], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0 && result.status !== 1) {
    process.stderr.write(result.stderr || result.stdout);
    return null;
  }
  return result.stdout
    .split(/\r?\n/u)
    .map((file) => file.trim().replaceAll("\\", "/"))
    .filter(Boolean)
    .sort();
}

export function runPrettierRatchet({ writeBaseline = false } = {}) {
  const current = listDifferent();
  if (!current) return 1;
  if (writeBaseline) {
    const payload = {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      policy: "shrink-only; new unformatted paths fail CI",
      unformattedFiles: current,
    };
    fs.writeFileSync(
      baselinePath,
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
    console.log(`prettier baseline written: ${current.length} legacy path(s)`);
    return 0;
  }

  if (!fs.existsSync(baselinePath)) {
    console.error("prettier baseline missing; run with --write-baseline once");
    return 1;
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const { regressions, improvements } = comparePrettierBaseline(
    current,
    baseline.unformattedFiles ?? [],
  );
  if (regressions.length > 0) {
    console.error("Prettier ratchet failed: new unformatted paths:");
    regressions.forEach((file) => console.error(`  - ${file}`));
    return 1;
  }
  console.log(
    `Prettier ratchet passed: ${current.length} legacy path(s), ${improvements.length} improvement(s), 0 regressions.`,
  );
  return 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  process.exitCode = runPrettierRatchet({
    writeBaseline: process.argv.includes("--write-baseline"),
  });
}
