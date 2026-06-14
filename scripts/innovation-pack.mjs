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
const body = [
  "<!-- generated-by: scripts/innovation-pack.mjs -->",
  `<!-- generated-at: ${now} -->`,
  "",
  "# Innovation Pack",
  "",
  "Fallback candidates generated when the primary genius list is thin.",
  "",
  "1. **alpha-gate-evidence-runbook** — Turn the operatorNext alpha-gate checklist into a repeatable local/manual runbook without replacing real tester evidence.",
  "2. **revenue-warning-fixture** — Add a focused fixture proving revenue warnings remain visible until a real checkout/supporter signal exists.",
  "3. **startup-go-protocol-smoke** — Keep a smoke test around `/start` and `/go` helper scripts so public-repo protocol drift is caught early.",
  "",
].join("\n");

fs.writeFileSync(outPath, body, "utf8");
console.log("✓ Innovation pack → docs/INNOVATION_PACK.md");
