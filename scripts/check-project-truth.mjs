#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateProjectTruth,
  readProjectTruthInputs,
} from "./lib/project-truth.mjs";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const rootIndex = process.argv.indexOf("--root");
const root =
  rootIndex >= 0 && process.argv[rootIndex + 1]
    ? path.resolve(process.argv[rootIndex + 1])
    : defaultRoot;
const jsonMode = process.argv.includes("--json");

const inputs = readProjectTruthInputs(root);
const result = evaluateProjectTruth(inputs);
const ok = result.ok && inputs.warnings.length === 0;
const payload = {
  ...result,
  ok,
  observedAt: new Date().toISOString(),
  source: "scripts/check-project-truth.mjs",
  warnings: inputs.warnings,
};

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else if (payload.ok) {
  console.log(`Project truth passed for audience '${payload.audience}'.`);
} else {
  console.error("Project truth contradictions:");
  for (const contradiction of payload.contradictions) {
    console.error(`  - ${contradiction.source}: ${contradiction.detail}`);
  }
}

process.exit(ok ? 0 : 1);
