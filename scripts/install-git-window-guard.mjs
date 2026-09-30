#!/usr/bin/env node
// install-git-window-guard.mjs
//
// Persistent Windows user-env guard for Codex/CLI Git runs. The safe-spawn wrapper
// protects Studio Node scripts; this installer covers raw `git ...` commands issued
// by Codex shells in future sessions by making Git non-interactive at process start.

import { GIT_WINDOW_GUARD_ENV } from "./lib/git-window-guard.mjs";
import { spawnSync } from "./lib/safe-spawn.mjs";

const APPLY = process.argv.includes("--apply");
const JSON_OUT = process.argv.includes("--json");
const IS_WINDOWS = process.platform === "win32";
const TARGET_KEYS = [
  "GIT_TERMINAL_PROMPT",
  "GIT_ASKPASS",
  "SSH_ASKPASS",
  "GCM_INTERACTIVE",
  "GIT_EDITOR",
  "GIT_SEQUENCE_EDITOR",
  "GIT_MERGE_AUTOEDIT",
  "GIT_PAGER",
];

function ps(script) {
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
    },
  );
  if (r.status !== 0) {
    throw new Error(
      (r.stderr || r.stdout || `PowerShell exited ${r.status}`).trim(),
    );
  }
  return r.stdout.trim();
}

function powershellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readUserEnv() {
  if (!IS_WINDOWS) return {};
  const names = TARGET_KEYS.map(powershellLiteral).join(",");
  const script = `$names=@(${names});$o=[ordered]@{};foreach($n in $names){$o[$n]=[Environment]::GetEnvironmentVariable($n,'User')};$o|ConvertTo-Json -Compress`;
  return JSON.parse(ps(script) || "{}");
}

function writeUserEnv() {
  const lines = TARGET_KEYS.map(
    (key) =>
      `[Environment]::SetEnvironmentVariable(${powershellLiteral(key)},${powershellLiteral(GIT_WINDOW_GUARD_ENV[key])},'User')`,
  );
  ps(lines.join(";"));
}

if (!IS_WINDOWS) {
  const report = {
    ok: true,
    platform: process.platform,
    applied: false,
    note: "non-Windows: no persistent Git window guard needed",
  };
  if (JSON_OUT) console.log(JSON.stringify(report));
  else console.log(report.note);
  process.exit(0);
}

let before;
try {
  before = readUserEnv();
} catch (e) {
  console.error(
    `install-git-window-guard: unable to read Windows user env: ${e.message}`,
  );
  process.exit(2);
}

const missing = TARGET_KEYS.filter(
  (key) => before[key] !== GIT_WINDOW_GUARD_ENV[key],
);
if (APPLY && missing.length) {
  try {
    writeUserEnv();
  } catch (e) {
    console.error(
      `install-git-window-guard: unable to write Windows user env: ${e.message}`,
    );
    process.exit(3);
  }
}

const after = APPLY ? readUserEnv() : before;
const stillMissing = TARGET_KEYS.filter(
  (key) => after[key] !== GIT_WINDOW_GUARD_ENV[key],
);
const report = {
  ok: stillMissing.length === 0,
  platform: process.platform,
  applied: APPLY && missing.length > 0,
  alreadyConfigured: missing.length === 0,
  changed: APPLY ? missing : [],
  missing: stillMissing,
  takesEffect: APPLY && missing.length ? "future Codex/shell processes" : null,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report));
} else if (report.ok) {
  if (report.applied) {
    console.log(
      `✓ Git window guard written to Windows User environment (${report.changed.join(", ")})`,
    );
    console.log(
      "  Takes effect for future Codex/shell processes. Current running terminals keep their existing environment.",
    );
  } else {
    console.log(
      "✓ Git window guard already present in Windows User environment.",
    );
  }
} else {
  console.error(`⛔ Git window guard incomplete: ${report.missing.join(", ")}`);
}

process.exit(report.ok ? 0 : 1);
