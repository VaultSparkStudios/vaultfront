#!/usr/bin/env node
/**
 * check-brief-staleness.mjs (G12 S118)
 *
 * Exits non-zero when STARTUP_BRIEF.md is stale (age > 24h OR intent-shift).
 * Silent on fresh brief. Used by studio-start to gate brief regeneration.
 *
 * Usage:
 *   node scripts/check-brief-staleness.mjs
 *   node scripts/check-brief-staleness.mjs --json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BRIEF_PATH = path.join(ROOT, "docs", "STARTUP_BRIEF.md");
const LOCK_PATH = path.join(ROOT, "context", ".session-lock");
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const jsonMode = process.argv.includes("--json");

function result(stale, reason, ageMs) {
  if (jsonMode) {
    console.log(JSON.stringify({ stale, reason, ageMs: ageMs ?? null }));
  } else if (stale) {
    console.log(`STALE: ${reason}`);
  }
  process.exit(stale ? 1 : 0);
}

if (!fs.existsSync(BRIEF_PATH)) {
  result(true, "STARTUP_BRIEF.md missing", null);
}

const stat = fs.statSync(BRIEF_PATH);
const ageMs = Date.now() - stat.mtimeMs;

if (ageMs > MAX_AGE_MS) {
  result(true, `age ${Math.round(ageMs / 3_600_000)}h > 24h threshold`, ageMs);
}

// Intent-shift check: compare session-lock intent with brief's embedded intent
let intentShift = false;
try {
  const lockRaw = fs.existsSync(LOCK_PATH)
    ? fs.readFileSync(LOCK_PATH, "utf8")
    : "";
  const lockIntent =
    (lockRaw.match(/"intent"\s*:\s*"([^"]+)"/) || [])[1] ?? null;
  const briefRaw = fs.readFileSync(BRIEF_PATH, "utf8");
  const briefIntent =
    (briefRaw.match(/Session intent[:\s]+(\w+)/i) || [])[1]?.toLowerCase() ??
    null;
  intentShift = lockIntent && briefIntent && lockIntent !== briefIntent;
} catch {
  // non-fatal
}

if (intentShift) {
  result(true, "session intent shifted since brief was generated", ageMs);
}

result(false, "fresh", ageMs);
