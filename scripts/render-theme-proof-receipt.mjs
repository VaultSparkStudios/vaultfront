#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const projects = ["chromium", "mobile-chrome"];
const runs = projects.map((project) =>
  JSON.parse(
    readFileSync(
      path.join(root, "output", "playwright", `theme-proof-${project}.json`),
      "utf8",
    ),
  ),
);
for (const run of runs) {
  if (run.localOnly !== true || run.results?.length !== 3) {
    throw new Error(`incomplete local theme proof for ${run.project}`);
  }
}
const receipt = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: "local-only",
  claimBoundary:
    "This is local browser evidence, not live staging parity or founder approval.",
  matrix: runs,
};
writeFileSync(
  path.join(root, "docs", "THEME_LOCAL_PROOF.json"),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(
  JSON.stringify({ ok: true, output: "docs/THEME_LOCAL_PROOF.json", runs: 6 }),
);
