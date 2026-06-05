#!/usr/bin/env node
/**
 * write-project-status.mjs — shared write-path for context/PROJECT_STATUS.json
 * (S154 audit #10 · root-fixes the silScore/sum drift class S143 kept catching).
 *
 * INVARIANTS enforced at write time (CANON-031 — observability must not lie):
 *   1. Every silCategoriesV3 value is clamped/validated to 0..100.
 *   2. silScore := sum(silCategoriesV3) — always recomputed, never trusted.
 *   3. silMax := 1000 when categories present (SIL v3.0 rubric, CANON-009).
 *   4. lastUpdated := today (ISO date) unless explicitly suppressed.
 *
 * Usage (lib):
 *   import { enforceSilInvariant, writeProjectStatus } from './lib/write-project-status.mjs';
 *   writeProjectStatus(repoRoot, status);            // validates + writes
 *   const fixed = enforceSilInvariant(status);       // pure — returns {status, violations}
 *
 * Usage (CLI — safe to propagate to sibling repos via protocol-scripts lane):
 *   node scripts/lib/write-project-status.mjs --check          # validate only, exit 1 on violation
 *   node scripts/lib/write-project-status.mjs --fix            # rewrite in place with invariants applied
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATS = [
  "devHealth",
  "creativeAlignment",
  "momentum",
  "engagement",
  "processQuality",
  "crossRepoCoherence",
  "securityPosture",
  "ecosystemIntegration",
  "capitalEfficiency",
  "automationCoverage",
];

/**
 * Pure invariant pass. Returns { status, violations } — status is a new object
 * with invariants applied; violations lists what was wrong (empty = clean).
 */
export function enforceSilInvariant(status) {
  const violations = [];
  const out = { ...status };
  const cats = out.silCategoriesV3;
  if (cats && typeof cats === "object") {
    const fixed = {};
    for (const key of CATS) {
      let v = cats[key];
      if (typeof v !== "number" || Number.isNaN(v)) {
        violations.push({
          field: `silCategoriesV3.${key}`,
          value: v,
          fix: "set 0 (was missing/non-numeric)",
        });
        v = 0;
      } else if (v < 0 || v > 100) {
        violations.push({
          field: `silCategoriesV3.${key}`,
          value: v,
          fix: `clamped to ${Math.min(100, Math.max(0, v))}`,
        });
        v = Math.min(100, Math.max(0, v));
      }
      fixed[key] = v;
    }
    // preserve any extra keys verbatim (forward-compat) but never let them
    // contribute to the score sum
    for (const [k, v] of Object.entries(cats)) if (!(k in fixed)) fixed[k] = v;
    out.silCategoriesV3 = fixed;
    const sum = CATS.reduce((s, k) => s + fixed[k], 0);
    if (out.silScore !== sum) {
      violations.push({
        field: "silScore",
        value: out.silScore,
        fix: `recomputed to ${sum} (= sum of categories)`,
      });
      out.silScore = sum;
    }
    if (out.silMax !== 1000) {
      violations.push({
        field: "silMax",
        value: out.silMax,
        fix: "set 1000 (SIL v3.0)",
      });
      out.silMax = 1000;
    }
  }
  return { status: out, violations };
}

/**
 * Validate + write context/PROJECT_STATUS.json under the invariant.
 * Returns { written, violations }. Throws only on I/O failure.
 */
export function writeProjectStatus(
  repoRoot,
  status,
  { touchLastUpdated = true } = {},
) {
  const { status: fixed, violations } = enforceSilInvariant(status);
  if (touchLastUpdated)
    fixed.lastUpdated = new Date().toISOString().slice(0, 10);
  const p = path.join(repoRoot, "context", "PROJECT_STATUS.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(fixed, null, 2) + "\n");
  return { written: p, violations };
}

/** Read-modify-write helper: apply a mutator fn under the invariant. */
export function updateProjectStatus(repoRoot, mutate, opts = {}) {
  const p = path.join(repoRoot, "context", "PROJECT_STATUS.json");
  const current = JSON.parse(fs.readFileSync(p, "utf8"));
  const next = mutate({ ...current }) || current;
  return writeProjectStatus(repoRoot, next, opts);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const repoRoot = (() => {
    const i = args.indexOf("--repo-root");
    return i >= 0 ? path.resolve(args[i + 1]) : process.cwd();
  })();
  const p = path.join(repoRoot, "context", "PROJECT_STATUS.json");
  if (!fs.existsSync(p)) {
    console.error(`⛔ no PROJECT_STATUS.json at ${p}`);
    process.exit(2);
  }
  const current = JSON.parse(fs.readFileSync(p, "utf8"));
  const { status: fixed, violations } = enforceSilInvariant(current);
  if (args.includes("--fix")) {
    if (violations.length) {
      fs.writeFileSync(p, JSON.stringify(fixed, null, 2) + "\n");
      console.log(`✓ fixed ${violations.length} violation(s):`);
      for (const v of violations)
        console.log(`  - ${v.field}=${JSON.stringify(v.value)} → ${v.fix}`);
    } else {
      console.log("✓ invariant clean — no changes");
    }
    process.exit(0);
  }
  // default: --check
  if (violations.length) {
    console.error(
      `⚠ ${violations.length} SIL invariant violation(s) in ${p}:`,
    );
    for (const v of violations)
      console.error(`  - ${v.field}=${JSON.stringify(v.value)} → ${v.fix}`);
    process.exit(1);
  }
  console.log(`✓ SIL invariant clean (silScore=${current.silScore ?? "—"})`);
  process.exit(0);
}

export default { enforceSilInvariant, writeProjectStatus, updateProjectStatus };
