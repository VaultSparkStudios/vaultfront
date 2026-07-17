#!/usr/bin/env node
/**
 * cache-genius-list.mjs
 *
 * Checks and writes .cache/genius-list.json for the /go protocol.
 *
 * Usage:
 *   node scripts/cache-genius-list.mjs --check
 *   node scripts/cache-genius-list.mjs --write
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { findLatestAuditSidecar } from "./lib/audit-sidecar.mjs";
import { spawnSync } from "./lib/safe-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const cachePath = path.join(root, ".cache", "genius-list.json");
const latestAuditInfo = findLatestAuditSidecar(root);
const sourceFiles = [
  "context/TASK_BOARD.md",
  "context/PROJECT_STATUS.json",
  "context/CURRENT_STATE.md",
  "context/SELF_IMPROVEMENT_LOOP.md",
  "docs/STARTUP_BRIEF.md",
  ...(latestAuditInfo ? [`docs/AUDIT_${latestAuditInfo.date}.json`] : []),
].map((rel) => path.join(root, rel));

function mtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}
function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return null;
  }
}
function isFresh() {
  const cache = readCache();
  if (!cache || !Array.isArray(cache.items) || cache.items.length === 0) {
    return { ok: false, reason: "missing-or-empty-cache" };
  }
  const cacheTime = mtimeMs(cachePath);
  const newestSource = Math.max(...sourceFiles.map(mtimeMs));
  if (newestSource > cacheTime) {
    return { ok: false, reason: "source-newer-than-cache" };
  }
  const ageMs = Date.now() - cacheTime;
  if (ageMs > 24 * 60 * 60 * 1000) {
    return { ok: false, reason: "cache-older-than-24h" };
  }
  return { ok: true, reason: "fresh" };
}
function writeCache() {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "generate-genius-list.mjs"), "--write"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    },
  );
  if (result.status !== 0) {
    process.stderr.write(
      result.stderr || result.stdout || "genius-list generation failed\n",
    );
    process.exit(result.status ?? 1);
  }
  process.stdout.write("✓ genius-list cache written\n");
}

if (args.includes("--check")) {
  const result = isFresh();
  if (result.ok) {
    console.log("✓ genius-list cache fresh");
    process.exit(0);
  }
  console.error(`✗ genius-list cache stale: ${result.reason}`);
  process.exit(1);
}

if (args.includes("--write")) {
  writeCache();
  process.exit(0);
}

console.log("Usage: node scripts/cache-genius-list.mjs --check|--write");
