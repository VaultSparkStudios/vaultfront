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
  {
    id: "certified-ai-response-receipts",
    title: "Bind every remote-AI answer to a verifiable response receipt",
    description:
      "Extend canonical request evidence through validated provider output, exact model identity, timestamp, and a tamper-evident response digest so cached and fresh answers share one auditable provenance contract.",
    complete:
      has(
        "src/server/CanonicalAiEvidence.ts",
        /buildCanonicalAiResponseReceipt/,
      ) &&
      has("src/server/Worker.ts", /receipt: buildCanonicalAiResponseReceipt/) &&
      has("tests/server/CanonicalAiEvidence.test.ts", /tamper-evident receipt/),
    evidence:
      "canonical AI response-receipt builder/verifier, live Worker wiring across oracle/coach/recap/debrief, cache preservation, and tamper tests",
  },
  {
    id: "agent-capability-reachability",
    title:
      "Publish a fail-closed Human + Agent capability reachability contract",
    description:
      "Cross-bind public capability claims to exact routes, client mounts, certificate consumers, policy middleware, and executable source tokens while preserving the honest public-unlaunched runtime posture.",
    complete:
      has(
        "public/capability-reachability.json",
        /implemented-local-unlaunched/,
      ) &&
      has("scripts/check-capability-reachability.mjs", /sourceDigest/) &&
      has("scripts/project-doctor.mjs", /capability-reachability/) &&
      has("tests/scripts/CapabilityReachability.test.ts", /fails closed/),
    evidence:
      "agent-readable capability manifest, source-digested reachability checker, agents.json discovery link, doctor probe, and fail-closed fixtures",
  },
  {
    id: "release-evidence-lineage-dag",
    title: "Turn release evidence into a self-verifying provenance DAG",
    description:
      "Chain source, external gates, local surfaces, work exhaustion, transfer budgets, and the final decision into ordered SHA-256 receipts with a single root digest that fails on tamper or forward references.",
    complete:
      has("scripts/lib/evidence-lineage.mjs", /verifyEvidenceLineage/) &&
      has("scripts/generate-release-evidence.mjs", /release-decision/) &&
      has("tests/scripts/EvidenceLineage.test.ts", /forward references/),
    evidence:
      "canonical evidence DAG builder/verifier, release-manifest integration, root receipt, and tamper/ordering tests",
  },
  {
    id: "startup-brief-semantic-sentinel",
    title: "Make the startup brief prove its own arithmetic",
    description:
      "Recompute context utilization and reject numeric SIL forecasts with zero parsed evidence so adjacent source-of-truth values cannot contradict one another behind a polished status tile.",
    complete:
      has("scripts/validate-brief-format.mjs", /semanticContradictions/) &&
      has("tests/scripts/StudioProtocolHelpers.test.ts", /token arithmetic/) &&
      has("tests/scripts/StudioProtocolHelpers.test.ts", /parsed SIL evidence/),
    evidence:
      "semantic brief validator, contradiction diagnostics, and adversarial context/SIL fixtures",
  },
  {
    id: "release-truth-fingerprint",
    title: "Bind cross-surface project truth into release provenance",
    description:
      "Fingerprint status identity, generated manifest posture, footer topology, and immutable deployment sources, then make that receipt a first-class parent of the release decision.",
    complete:
      has("scripts/lib/project-truth.mjs", /buildProjectTruthFingerprint/) &&
      has("scripts/generate-release-evidence.mjs", /cross-surface-truth/) &&
      has("tests/scripts/ProjectDoctor.test.ts", /tamper-sensitively/),
    evidence:
      "canonical project-truth fingerprint, source digests, release-lineage node, and mutation-sensitive tests",
  },
  {
    id: "operator-rollback-receipt-contract",
    title: "Turn rollback prose into an executable receipt contract",
    description:
      "Require immutable image and staging-evidence digests, dry-run-first promotion, canonical health verification, and a retained rollback receipt so recovery instructions cannot drift from workflow inputs.",
    complete:
      has("docs/DEPLOY_RUNTIME_RUNBOOK.md", /staging_evidence_digest/) &&
      has("scripts/check-deploy-contract.mjs", /rollback receipt/) &&
      has(
        "tests/scripts/StudioProtocolHelpers.test.ts",
        /check-deploy-contract/,
      ),
    evidence:
      "digest-addressed operator runbook, 25-check deploy contract gate, and protocol regression execution",
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
