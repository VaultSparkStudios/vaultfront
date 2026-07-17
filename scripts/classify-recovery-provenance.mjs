#!/usr/bin/env node
/**
 * Read-only recovery provenance classifier.
 *
 * It separates known lint-staged backup residue, propagated protocol surfaces,
 * generated session artifacts, and current work. It never applies a stash or
 * mutates the worktree.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";

const PROTOCOL_PATHS = [
  "AGENTS.md",
  "docs/SESSION_PROTOCOL.md",
  "prompts/start.md",
  "prompts/closeout.md",
  "prompts/initiate.md",
  "scripts/check-canon-044-waves.mjs",
];

const GENERATED_PATHS = [
  "docs/STARTUP_BRIEF.md",
  "docs/CLOSEOUT_STATUS_BOARD.md",
  "context/LATEST_HANDOFF.compact.md",
  "context/STATE_VECTOR.json",
];

export function parsePorcelain(text) {
  return String(text || "")
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({
      status: entry.slice(0, 2),
      path: entry.slice(3).replaceAll("\\", "/"),
    }));
}

export function classifyRecovery({
  status = [],
  stashes = "",
  markerFiles = [],
}) {
  const lintStagedBackups = String(stashes)
    .split(/\r?\n/)
    .filter((line) => /lint-staged automatic backup/i.test(line));
  const files = status.map((entry) => {
    const normalized = entry.path.replace(/^"|"$/g, "");
    const category = PROTOCOL_PATHS.includes(normalized)
      ? "propagated-protocol"
      : GENERATED_PATHS.includes(normalized)
        ? "generated-session-artifact"
        : "current-work";
    return { ...entry, path: normalized, category };
  });
  const unresolved = [...new Set(markerFiles)].sort();
  return {
    ok: unresolved.length === 0,
    corrupt: unresolved.length > 0,
    lintStagedBackups,
    files,
    counts: files.reduce(
      (out, file) => {
        out[file.category] = (out[file.category] ?? 0) + 1;
        return out;
      },
      {
        "propagated-protocol": 0,
        "generated-session-artifact": 0,
        "current-work": 0,
      },
    ),
    unresolvedMergeMarkers: unresolved,
  };
}

function git(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
      GIT_PAGER: "cat",
    },
  });
  return result.status === 0 ? result.stdout : "";
}

function markerFiles(root, files) {
  const findings = [];
  for (const entry of files) {
    const full = path.join(root, entry.path);
    if (!fs.existsSync(full) || fs.statSync(full).size > 1_000_000) continue;
    let body;
    try {
      body = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (/^<<<<<<< .+$|^=======$|^>>>>>>> .+$/m.test(body)) {
      findings.push(entry.path);
    }
  }
  return findings;
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirect) {
  const root = process.cwd();
  const status = parsePorcelain(
    git(root, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]),
  );
  const result = classifyRecovery({
    status,
    stashes: git(root, ["stash", "list", "--format=%gd %s"]),
    markerFiles: markerFiles(root, status),
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Recovery provenance: ${result.files.length} changed path(s), ${result.lintStagedBackups.length} lint-staged backup(s)`,
    );
    for (const [name, count] of Object.entries(result.counts)) {
      console.log(`  ${name}: ${count}`);
    }
    if (result.unresolvedMergeMarkers.length) {
      console.error(
        `  unresolved merge markers: ${result.unresolvedMergeMarkers.join(", ")}`,
      );
    }
  }
  process.exit(result.ok ? 0 : 1);
}
