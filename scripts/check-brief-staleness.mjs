#!/usr/bin/env node
/** Fail closed when the fast-boot brief is old or its canonical sources moved. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBriefSourceFreshness } from "./lib/brief-freshness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function checkBriefFreshness({
  root = ROOT,
  now = Date.now(),
  maxAgeMs = MAX_AGE_MS,
} = {}) {
  const briefPath = path.join(root, "docs", "STARTUP_BRIEF.md");
  if (!fs.existsSync(briefPath)) {
    return { stale: true, reason: "STARTUP_BRIEF.md missing", ageMs: null };
  }
  const ageMs = now - fs.statSync(briefPath).mtimeMs;
  if (ageMs > maxAgeMs) {
    return {
      stale: true,
      reason: `age ${Math.round(ageMs / 3_600_000)}h > ${Math.round(maxAgeMs / 3_600_000)}h threshold`,
      ageMs,
    };
  }
  const brief = fs.readFileSync(briefPath, "utf8");
  const coherence = evaluateBriefSourceFreshness(root, brief);
  if (!coherence.fresh) {
    return { stale: true, reason: coherence.reason, ageMs };
  }
  return { stale: false, reason: "fresh and source-coherent", ageMs };
}

const direct =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const result = checkBriefFreshness();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result));
  } else if (result.stale) {
    console.log(`STALE: ${result.reason}`);
  }
  process.exit(result.stale ? 1 : 0);
}
