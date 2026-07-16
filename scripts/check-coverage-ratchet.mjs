#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const METRICS = ["lines", "statements", "functions", "branches"];

export function normalizeCoveragePath(value) {
  return String(value).replaceAll("\\", "/");
}

export function evaluateCoverage(summary, baseline) {
  const failures = [];
  const tolerance = Number(baseline.tolerance ?? 0);

  function compare(label, actual, floors) {
    for (const metric of METRICS) {
      const pct = Number(actual?.[metric]?.pct);
      const floor = Number(floors?.[metric]);
      if (!Number.isFinite(pct)) {
        failures.push(`${label} ${metric}: missing coverage value`);
      } else if (!Number.isFinite(floor)) {
        failures.push(`${label} ${metric}: missing baseline floor`);
      } else if (pct + tolerance < floor) {
        failures.push(
          `${label} ${metric}: ${pct.toFixed(2)}% < ${floor.toFixed(2)}% floor`,
        );
      }
    }
  }

  compare("global", summary.total, baseline.global);
  const entries = Object.entries(summary).map(([key, value]) => [
    normalizeCoveragePath(key),
    value,
  ]);
  for (const [modulePath, floors] of Object.entries(
    baseline.criticalModules ?? {},
  )) {
    const suffix = `/${normalizeCoveragePath(modulePath)}`;
    const match = entries.find(([key]) => key.endsWith(suffix));
    if (!match) {
      failures.push(`${modulePath}: missing from coverage report`);
      continue;
    }
    compare(modulePath, match[1], floors);
  }

  return { ok: failures.length === 0, failures };
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirect) {
  const root = process.cwd();
  const summaryPath = path.join(root, "coverage", "coverage-summary.json");
  const baselinePath = path.join(root, "coverage-baseline.json");
  if (!fs.existsSync(summaryPath) || !fs.existsSync(baselinePath)) {
    console.error(
      "Coverage ratchet requires coverage/coverage-summary.json and coverage-baseline.json",
    );
    process.exit(2);
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const result = evaluateCoverage(summary, baseline);
  if (!result.ok) {
    console.error("Coverage ratchet failed:");
    for (const failure of result.failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `Coverage ratchet passed: global floor + ${Object.keys(baseline.criticalModules ?? {}).length} critical modules`,
  );
}
