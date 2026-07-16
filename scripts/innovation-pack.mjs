#!/usr/bin/env node
/**
 * innovation-pack.mjs
 *
 * Lightweight fallback innovation-pack generator for public-safe repos.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "docs", "INNOVATION_PACK.md");
const now = new Date().toISOString();
const has = (relativePath, pattern) => {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) return false;
  return pattern ? pattern.test(fs.readFileSync(target, "utf8")) : true;
};
const candidates = [
  {
    id: "alpha-gate-evidence-runbook",
    description:
      "Turn the operatorNext alpha-gate checklist into a repeatable local/manual runbook without replacing real tester evidence.",
    complete:
      has("src/server/VaultFrontAlphaGateRunbook.ts", /evidenceFields/) &&
      has(
        "tests/server/VaultFrontAlphaGateRunbook.test.ts",
        /Revenue remains unverified/,
      ),
    evidence:
      "VaultFrontAlphaGateRunbook plus human-evidence and revenue-separation tests",
  },
  {
    id: "revenue-warning-fixture",
    description:
      "Add a focused fixture proving revenue warnings remain visible until a real checkout/supporter signal exists.",
    complete: has(
      "tests/server/VaultFrontReadiness.test.ts",
      /checks\.revenueSignal\)\.toBe\("warn"\)/,
    ),
    evidence: "VaultFrontReadiness warning/pass fixtures",
  },
  {
    id: "startup-go-protocol-smoke",
    description:
      "Keep a smoke test around `/start` and `/go` helper scripts so public-repo protocol drift is caught early.",
    complete: has(
      "tests/scripts/StudioStartGoSmoke.test.ts",
      /ops\.mjs.*genius-list/s,
    ),
    evidence: "StudioStartGoSmoke dispatcher and contract tests",
  },
];
const body = [
  "<!-- generated-by: scripts/innovation-pack.mjs -->",
  `<!-- generated-at: ${now} -->`,
  "",
  "# Innovation Pack",
  "",
  "Fallback candidates generated when the primary genius list is thin. Completion is derived from checked-in implementation evidence.",
  "",
  ...candidates.map(
    (candidate, index) =>
      `${index + 1}. [${candidate.complete ? "x" : " "}] **${candidate.id}** — ${candidate.description}${candidate.complete ? ` Evidence: ${candidate.evidence}.` : ""}`,
  ),
  "",
].join("\n");

fs.writeFileSync(outPath, body, "utf8");
console.log("✓ Innovation pack → docs/INNOVATION_PACK.md");
