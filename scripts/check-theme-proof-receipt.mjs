#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const expectedThemes = new Set(["vaultfront", "light", "competitive"]);
const expectedProjects = new Set(["chromium", "mobile-chrome"]);

export function checkThemeProofReceipt(root = defaultRoot, now = Date.now()) {
  const source = "docs/THEME_LOCAL_PROOF.json";
  const errors = [];
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(path.join(root, source), "utf8"));
  } catch (error) {
    return {
      ok: false,
      source,
      errors: [`unreadable receipt: ${String(error)}`],
    };
  }
  if (receipt.schemaVersion !== 1) errors.push("unsupported schemaVersion");
  if (receipt.scope !== "local-only")
    errors.push("scope must remain local-only");
  const generatedAt = Date.parse(receipt.generatedAt);
  const ageDays = (now - generatedAt) / 86_400_000;
  if (!Number.isFinite(generatedAt)) errors.push("invalid generatedAt");
  else if (ageDays < -5 / 1440) errors.push("generatedAt is in the future");
  else if (ageDays > 30)
    errors.push(`receipt is stale (${ageDays.toFixed(1)} days)`);

  const seenProjects = new Set();
  for (const run of receipt.matrix ?? []) {
    seenProjects.add(run.project);
    if (run.localOnly !== true)
      errors.push(`${run.project}: localOnly must be true`);
    const seenThemes = new Set();
    for (const result of run.results ?? []) {
      seenThemes.add(result.theme);
      if (
        !Array.isArray(result.surfaces) ||
        !result.surfaces.includes("play") ||
        !result.surfaces.includes("settings")
      ) {
        errors.push(
          `${run.project}/${result.theme}: missing play/settings surfaces`,
        );
      }
      for (const [label, ratio] of Object.entries(result.ratios ?? {})) {
        if (!Number.isFinite(ratio) || ratio < 4.5) {
          errors.push(
            `${run.project}/${result.theme}: ${label} contrast below 4.5`,
          );
        }
      }
    }
    for (const theme of expectedThemes) {
      if (!seenThemes.has(theme))
        errors.push(`${run.project}: missing ${theme}`);
    }
  }
  for (const project of expectedProjects) {
    if (!seenProjects.has(project)) errors.push(`missing project ${project}`);
  }
  return {
    ok: errors.length === 0,
    source,
    scope: receipt.scope,
    matrixCells: (receipt.matrix ?? []).reduce(
      (sum, run) => sum + (run.results?.length ?? 0),
      0,
    ),
    ageDays: Number.isFinite(ageDays) ? Number(ageDays.toFixed(3)) : null,
    errors,
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const rootIndex = process.argv.indexOf("--root");
  const root =
    rootIndex >= 0 && process.argv[rootIndex + 1]
      ? path.resolve(process.argv[rootIndex + 1])
      : defaultRoot;
  const result = checkThemeProofReceipt(root);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
