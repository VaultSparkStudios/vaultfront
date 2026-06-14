#!/usr/bin/env node
/**
 * set-active-skill.mjs
 *
 * Records the active Studio OS skill for lightweight ROI attribution.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = process.argv[2] || "unknown";
const out = {
  skill,
  setAt: new Date().toISOString(),
  source: "scripts/set-active-skill.mjs",
};

fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
fs.writeFileSync(
  path.join(root, ".cache", "active-skill.json"),
  JSON.stringify(out, null, 2) + "\n",
  "utf8",
);
console.log(`✓ active skill set: ${skill}`);
