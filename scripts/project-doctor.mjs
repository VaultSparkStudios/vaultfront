#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function probeResult(id, command, args, root) {
  const observedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  const exitCode = result.status ?? 1;
  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();
  return {
    id,
    status: exitCode === 0 ? "pass" : "fail",
    source: [command, ...args].join(" "),
    observedAt,
    exitCode,
    detail: stderr || stdout || result.error?.message || `Exited ${exitCode}`,
    data: parseJson(stdout),
  };
}

export function runProjectDoctor({
  root = defaultRoot,
  truthOnly = false,
  forceFailure = false,
} = {}) {
  const probes = [
    {
      id: "release-metadata-truth",
      command: process.execPath,
      args: [
        path.join(defaultRoot, "scripts", "check-project-truth.mjs"),
        "--root",
        root,
        "--json",
      ],
    },
  ];
  if (!truthOnly) {
    probes.push(
      {
        id: "task-id-integrity",
        command: process.execPath,
        args: [path.join(defaultRoot, "scripts", "validate-task-ids.mjs")],
      },
      {
        id: "windows-spawn-hygiene",
        command: process.execPath,
        args: [path.join(defaultRoot, "scripts", "check-windows-hide.mjs")],
      },
      {
        id: "work-exhaustion",
        command: process.execPath,
        args: [
          path.join(defaultRoot, "scripts", "check-work-exhaustion.mjs"),
          "--root",
          root,
          "--json",
        ],
      },
    );
  }
  if (forceFailure) {
    probes.push({
      id: "forced-failure",
      command: process.execPath,
      args: ["-e", "process.exit(17)"],
    });
  }

  const checks = probes.map((probe) =>
    probeResult(probe.id, probe.command, probe.args, root),
  );
  const warnings = checks
    .flatMap((check) => check.data?.warnings ?? [])
    .filter((warning) => typeof warning === "string" && warning.length > 0);
  return {
    checks,
    warnings,
    blockingFailing: checks.filter((check) => check.status === "fail").length,
    observedAt: new Date().toISOString(),
    source: "scripts/project-doctor.mjs",
  };
}

export function updateProjectStatus(root, report) {
  const target = path.join(root, "context", "PROJECT_STATUS.json");
  const status = JSON.parse(fs.readFileSync(target, "utf8"));
  const passing = report.checks.filter(
    (check) => check.status === "pass",
  ).length;
  const output = {
    ...status,
    doctorScore: {
      passing,
      total: report.checks.length,
      score:
        report.checks.length === 0
          ? 0
          : Math.round((passing / report.checks.length) * 100),
      warning: report.warnings.length,
      warnings: report.warnings.length,
      failing: report.blockingFailing,
      blockingFailing: report.blockingFailing,
      date: report.observedAt.slice(0, 10),
      observedAt: report.observedAt,
      source: report.source,
      checks: report.checks,
    },
  };
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}

function renderHuman(report) {
  const lines = ["Project doctor"];
  for (const check of report.checks) {
    lines.push(
      `${check.status === "pass" ? "PASS" : "FAIL"} ${check.id} (exit ${check.exitCode})`,
    );
  }
  for (const warning of report.warnings) lines.push(`WARN ${warning}`);
  lines.push(`blockingFailing: ${report.blockingFailing}`);
  lines.push(`observedAt: ${report.observedAt}`);
  return lines.join("\n");
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirect) {
  const rootIndex = process.argv.indexOf("--root");
  const root =
    rootIndex >= 0 && process.argv[rootIndex + 1]
      ? path.resolve(process.argv[rootIndex + 1])
      : defaultRoot;
  const report = runProjectDoctor({
    root,
    truthOnly: process.argv.includes("--truth-only"),
    forceFailure: process.argv.includes("--force-failure"),
  });
  if (process.argv.includes("--update-json")) updateProjectStatus(root, report);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(renderHuman(report));
  }
  process.exit(report.blockingFailing === 0 ? 0 : 1);
}
