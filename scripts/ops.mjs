#!/usr/bin/env node
/**
 * ops.mjs — Studio OS operations orchestrator.
 *
 * Top-level dispatcher for studio workflow subcommands.
 * Each subcommand delegates to the relevant standalone script.
 *
 * Usage:
 *   node scripts/ops.mjs <subcommand> [args...]
 *
 * Subcommands:
 *   blocker-preflight     Run scripts/blocker-preflight.mjs
 *   startup-brief         Run scripts/render-startup-brief.mjs
 *   closeout-board        Run scripts/render-closeout-board.mjs
 *   genius-list           Run scripts/generate-genius-list.mjs --write
 *   innovation-pack       Run scripts/innovation-pack.mjs
 *   write-session-lock    Run scripts/write-session-lock.mjs
 *   check-secrets         Run scripts/check-secrets.mjs
 *   doctor                Print project health summary
 */

import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = __dirname;

const [, , subcommand, ...rest] = process.argv;

const SUBCOMMAND_MAP = {
  "blocker-preflight": "blocker-preflight.mjs",
  "startup-brief": "render-startup-brief.mjs",
  "closeout-board": "render-closeout-board.mjs",
  "genius-list": "generate-genius-list.mjs",
  "innovation-pack": "innovation-pack.mjs",
  "write-session-lock": "write-session-lock.mjs",
  "check-secrets": "check-secrets.mjs",
};

if (!subcommand) {
  console.log("Usage: node scripts/ops.mjs <subcommand> [args...]");
  console.log(
    "Subcommands:",
    Object.keys(SUBCOMMAND_MAP).join(", "),
    ", doctor, compliance-velocity",
  );
  process.exit(0);
}

if (subcommand === "doctor") {
  console.log(
    "ops.mjs doctor: run node scripts/context-meter.mjs --json for health check",
  );
  process.exit(0);
}

if (subcommand === "compliance-velocity") {
  console.log("ops.mjs compliance-velocity: not yet tracked");
  process.exit(0);
}

const scriptFile = SUBCOMMAND_MAP[subcommand];
if (!scriptFile) {
  console.error(`ops.mjs: unknown subcommand '${subcommand}'`);
  console.error("Known subcommands:", Object.keys(SUBCOMMAND_MAP).join(", "));
  process.exit(1);
}

const scriptPath = path.join(SCRIPTS, scriptFile);
const mappedArgs =
  subcommand === "genius-list" && rest.length === 0 ? ["--write"] : rest;
const result = spawnSync(process.execPath, [scriptPath, ...mappedArgs], {
  stdio: "inherit",
});
process.exit(result.status ?? 0);
