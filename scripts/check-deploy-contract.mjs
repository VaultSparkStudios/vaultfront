#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "./lib/safe-spawn.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASH =
  process.platform === "win32" &&
  fs.existsSync("C:\\Program Files\\Git\\bin\\bash.exe")
    ? "C:\\Program Files\\Git\\bin\\bash.exe"
    : "bash";
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const failures = [];
const requireText = (body, pattern, message) => {
  if (!pattern.test(body)) failures.push(message);
};

const deploy = read("deploy.sh");
const update = read("update.sh");
const buildDeploy = read("build-deploy.sh");
const deployWorkflow = read(".github/workflows/deploy.yml");
const promoteWorkflow = read(".github/workflows/promote.yml");
const prWorkflow = read(".github/workflows/pr-description.yml");

if (fs.existsSync(path.join(ROOT, ".github/workflows/release.yml"))) {
  failures.push("dormant legacy release.yml still exists");
}
for (const [name, body] of [
  ["deploy workflow", deployWorkflow],
  ["promote workflow", promoteWorkflow],
]) {
  if (/openfront|falk2|deploy-alpha|deploy-beta/i.test(body)) {
    failures.push(`${name} retains an upstream infrastructure target`);
  }
}
requireText(deploy, /DEPLOY_DRY_RUN/, "deploy.sh has no dry-run path");
requireText(
  deploy,
  /\^sha256:\[0-9a-f\]\{64\}\$/,
  "deploy.sh does not validate immutable digests",
);
requireText(
  deploy,
  /DEPLOY_STAGING_ATTESTATION/,
  "production has no staging attestation gate",
);
requireText(
  buildDeploy,
  /containerimage\.digest/,
  "build wrapper does not consume the build digest",
);
requireText(
  update,
  /DEPLOY_IMAGE_RETENTION/,
  "remote updater has no bounded retention input",
);
if (/docker\s+image\s+prune\s+-a/.test(update)) {
  failures.push("remote updater still prunes every unused image");
}
requireText(
  prWorkflow,
  /dependabot\[bot\]/,
  "PR workflow lacks a trusted automation identity contract",
);
requireText(
  prWorkflow,
  /pulls\.listFiles/,
  "automation PRs are not restricted by changed-file scope",
);
requireText(
  promoteWorkflow,
  /staging_evidence_digest/,
  "promotion lacks explicit staging evidence",
);

for (const script of ["build-deploy.sh", "deploy.sh", "update.sh"]) {
  const syntax = spawnSync(BASH, ["-n", script], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (syntax.status !== 0) {
    failures.push(`${script} failed bash -n: ${String(syntax.stderr).trim()}`);
  }
}

const digest = `sha256:${"0".repeat(64)}`;
const baseEnv = {
  ...process.env,
  DEPLOY_DRY_RUN: "1",
  DEPLOY_HEALTH_URL: "https://staging.example.test/api/health",
  GHCR_REPO: "vaultfront",
  GHCR_USERNAME: "vaultsparkstudios",
};
const dryRun = spawnSync(
  BASH,
  ["deploy.sh", "staging", "staging", digest, "staging"],
  { cwd: ROOT, encoding: "utf8", env: baseEnv },
);
if (dryRun.status !== 0 || !/deploy-contract ok/.test(String(dryRun.stdout))) {
  failures.push(`staging dry-run failed: ${String(dryRun.stderr).trim()}`);
}
const mutable = spawnSync(
  BASH,
  ["deploy.sh", "staging", "staging", "latest", "staging"],
  { cwd: ROOT, encoding: "utf8", env: baseEnv },
);
if (mutable.status === 0)
  failures.push("mutable image tag passed deploy validation");
const mismatch = spawnSync(
  BASH,
  ["deploy.sh", "prod", "primary", digest, "main"],
  {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...baseEnv, DEPLOY_STAGING_ATTESTATION: `sha256:${"1".repeat(64)}` },
  },
);
if (mismatch.status === 0)
  failures.push("production accepted mismatched staging evidence");

const report = {
  ok: failures.length === 0,
  source: "scripts/check-deploy-contract.mjs",
  checks: 16,
  failures,
};
if (process.argv.includes("--json"))
  console.log(JSON.stringify(report, null, 2));
else if (report.ok)
  console.log("PASS immutable deploy/workflow contract (16 checks)");
else failures.forEach((failure) => console.error(`FAIL ${failure}`));
process.exit(report.ok ? 0 : 1);
