#!/usr/bin/env node
/**
 * Live second-order innovation pack generated after the audit-backed genius
 * list is exhausted. Completion is derived from checked-in evidence.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const markdownPath = path.join(root, "docs", "INNOVATION_PACK.md");
const jsonPath = path.join(root, "docs", "INNOVATION_PACK.json");
const now = new Date().toISOString();
const has = (relativePath, pattern) => {
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) return false;
  return pattern ? pattern.test(fs.readFileSync(target, "utf8")) : true;
};

const candidates = [
  {
    id: "runtime-integrity-passport",
    title: "Ship a digestible process-local Runtime Integrity Passport",
    description:
      "Fuse live IPC/game-loop health, experiment rejection posture, remote-AI reservation truth, and bounded WebSocket policy into one admin-only, scope-labeled, SHA-256-digested contract.",
    complete:
      has("src/server/RuntimeIntegrityPassport.ts", /evidenceDigest/) &&
      has("src/server/Worker.ts", /runtime-integrity-passport/) &&
      has("tests/server/RuntimeIntegrityPassport.test.ts", /tamper/),
    evidence:
      "RuntimeIntegrityPassport module, admin route, canonical digest and tamper-sensitive tests",
  },
  {
    id: "release-evidence-manifest",
    title:
      "Emit a machine-readable Release Evidence Manifest after every build",
    description:
      "Bind Git revision/dirty state, launch mode, audit exhaustion, and exact transfer budgets into static/release-evidence.json so promotion and agents consume the same provenance.",
    complete:
      has("scripts/generate-release-evidence.mjs", /release-evidence\.json/) &&
      has("package.json", /generate-release-evidence\.mjs/) &&
      has("tests/scripts/ReleaseEvidenceManifest.test.ts", /dirty/),
    evidence:
      "post-build manifest generator, build wiring, and clean/dirty provenance tests",
  },
  {
    id: "exhaustion-proof-gate",
    title: "Turn complete-all into a machine-enforced Exhaustion Proof gate",
    description:
      "Fail the doctor and closeout whenever the latest audit or innovation sidecar retains a pending unblocked item; emit counts and exact item IDs instead of relying on prose.",
    complete:
      has("scripts/check-work-exhaustion.mjs", /pendingUnblocked/) &&
      has("scripts/project-doctor.mjs", /work-exhaustion/) &&
      has("tests/scripts/WorkExhaustion.test.ts", /pending audit/),
    evidence:
      "audit+innovation exhaustion checker, doctor probe, and pending/deferred fixtures",
  },
];

const payload = {
  schemaVersion: "1.0",
  generatedAt: now,
  source: "scripts/innovation-pack.mjs",
  primarySource: "latest audit-backed Unified Genius List",
  items: candidates.map((candidate, index) => ({
    rank: index + 1,
    status: candidate.complete ? "shipped" : "pending",
    ...candidate,
  })),
};

const body = [
  "<!-- generated-by: scripts/innovation-pack.mjs -->",
  `<!-- generated-at: ${now} -->`,
  "",
  "# Second-Order Innovation Pack",
  "",
  "Generated only after the audit-backed Unified Genius List was exhausted. Completion is derived from checked-in implementation evidence.",
  "",
  ...payload.items.map(
    (candidate) =>
      `${candidate.rank}. [${candidate.complete ? "x" : " "}] **${candidate.id}** — ${candidate.title}. ${candidate.description}${candidate.complete ? ` Evidence: ${candidate.evidence}.` : ""}`,
  ),
  "",
].join("\n");

fs.writeFileSync(markdownPath, body, "utf8");
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `✓ Innovation pack → ${path.relative(root, markdownPath)} (${payload.items.filter((item) => item.complete).length}/${payload.items.length} shipped)`,
);
