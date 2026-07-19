#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  effectiveByteLimit,
  extractInitialEntryAssetPaths,
  measureCompressedAssets,
  measureMediaAssets,
} from "./check-bundle-budget.mjs";
import { checkFooterManifest } from "./check-footer-manifest.mjs";
import { findLatestAuditSidecar } from "./lib/audit-sidecar.mjs";
import {
  buildEvidenceLineage,
  verifyEvidenceLineage,
} from "./lib/evidence-lineage.mjs";
import { spawnSync } from "./lib/safe-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export const canonicalReleaseGateDefinitions = Object.freeze([
  ["staging", "Staging deployment"],
  ["stagingParity", "Staging parity"],
  ["contactEmail", "Brevo project-domain contact email"],
  ["obeliskIdentity", "Obelisk relying-party identity"],
  ["themeReadability", "Live theme readability"],
  ["footerManifest", "Public footer manifest"],
  ["founderApproval", "Founder launch approval"],
  ["alphaHumanEvidence", "Authenticated human Alpha Gate"],
]);

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digestFiles(projectRoot, relativePaths) {
  const hash = createHash("sha256");
  for (const relativePath of [...relativePaths].sort()) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(projectRoot, relativePath)));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function statusCounts(items = []) {
  return items.reduce((counts, item) => {
    const status = String(item.status ?? "pending");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function evaluateObservation(key, label, observation, now, maxAgeMs) {
  const observedAtMs = observation?.observedAt
    ? Date.parse(observation.observedAt)
    : Number.NaN;
  const ageMs = Number.isFinite(observedAtMs) ? now - observedAtMs : null;
  const freshnessState =
    ageMs == null
      ? "missing"
      : ageMs < 0
        ? "future"
        : ageMs > maxAgeMs
          ? "stale"
          : "fresh";
  const sourceComplete = Boolean(observation?.source?.trim());
  const digestComplete = /^sha256:[0-9a-f]{64}$/i.test(
    observation?.digest ?? "",
  );
  const verified = observation?.status === "verified";
  const pass =
    verified && freshnessState === "fresh" && sourceComplete && digestComplete;
  let detail;
  if (!observation) detail = "No evidence observation is attached.";
  else if (!verified)
    detail =
      observation.detail ??
      `Evidence status is ${observation.status ?? "missing"}.`;
  else if (freshnessState !== "fresh")
    detail = `Evidence timestamp is ${freshnessState}; a fresh observation is required.`;
  else if (!sourceComplete || !digestComplete)
    detail =
      "Evidence requires a named source and canonical sha256 digest provenance.";
  else
    detail = observation.detail ?? "Fresh provenance-backed evidence verified.";
  return {
    gate: key,
    label,
    status: pass ? "pass" : "block",
    evidenceStatus: observation?.status ?? "missing",
    source: observation?.source ?? null,
    observedAt: observation?.observedAt ?? null,
    digest: observation?.digest ?? null,
    freshness: { state: freshnessState, ageMs, maxAgeMs },
    detail,
  };
}

export function evaluateCanonicalReleaseGates(
  observations = {},
  { now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS } = {},
) {
  const gates = canonicalReleaseGateDefinitions.map(([key, label]) =>
    evaluateObservation(key, label, observations[key], now, maxAgeMs),
  );
  const blockers = gates
    .filter((gate) => gate.status === "block")
    .map((gate) => `${gate.gate}: ${gate.detail}`);
  return {
    schemaVersion: 1,
    status: blockers.length === 0 ? "ready" : "blocked",
    evaluatedAt: new Date(now).toISOString(),
    maxAgeMs,
    gates,
    blockers,
  };
}

export function buildLocalSurfaceEvidence(projectRoot, observedAt) {
  const healthSources = ["src/server/Master.ts", "src/server/Worker.ts"];
  const missingHealthRoutes = healthSources.filter((relativePath) => {
    const body = fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
    return !/app\.get\(\s*["']\/_health["']/.test(body);
  });
  const healthEndpoint = {
    status: missingHealthRoutes.length === 0 ? "pass" : "block",
    source: healthSources.join(" + "),
    observedAt,
    digest: digestFiles(projectRoot, healthSources),
    detail:
      missingHealthRoutes.length === 0
        ? "Canonical /_health route is declared by both Master and Worker."
        : `Canonical /_health route missing from: ${missingHealthRoutes.join(", ")}.`,
  };

  let footerManifest;
  try {
    const result = checkFooterManifest(projectRoot);
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, "public/footer-manifest.json"),
        "utf8",
      ),
    );
    const files = [
      "public/footer-manifest.json",
      ...(manifest.pages ?? []).map((page) => page.source),
    ];
    footerManifest = {
      status: result.ok ? "verified" : "failed",
      source: "scripts/check-footer-manifest.mjs + public/footer-manifest.json",
      observedAt,
      digest: digestFiles(projectRoot, files),
      detail: result.ok
        ? `${result.pageCount} manifest pages passed the executable footer contract.`
        : result.errors.join("; "),
    };
  } catch (error) {
    footerManifest = {
      status: "failed",
      source: "scripts/check-footer-manifest.mjs",
      observedAt,
      digest: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  return { healthEndpoint, footerManifest };
}

export function loadReleaseGateObservations(projectRoot) {
  const configured = process.env.VAULTFRONT_RELEASE_GATE_EVIDENCE_PATH;
  const evidencePath = configured
    ? path.resolve(projectRoot, configured)
    : path.join(projectRoot, ".cache", "release-gate-observations.json");
  const relativePath = path
    .relative(projectRoot, evidencePath)
    .replace(/\\/g, "/");
  if (!fs.existsSync(evidencePath)) {
    return {
      state: "missing",
      path: relativePath,
      digest: null,
      observations: {},
      detail: "No live release-gate observation bundle is present.",
    };
  }
  try {
    const body = fs.readFileSync(evidencePath, "utf8");
    const parsed = JSON.parse(body);
    if (parsed.schemaVersion !== 1 || typeof parsed.observations !== "object") {
      throw new Error("expected schemaVersion 1 with an observations object");
    }
    return {
      state: "loaded",
      path: relativePath,
      digest: sha256(body),
      observations: parsed.observations,
      detail:
        "Observation bundle loaded; each gate is independently revalidated.",
    };
  } catch (error) {
    return {
      state: "invalid",
      path: relativePath,
      digest: null,
      observations: {},
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildReleaseEvidence({
  generatedAt,
  gitSha,
  dirty,
  auditSource,
  auditItems,
  innovationItems,
  transfer,
  releaseObservations = {},
  observationBundle = {
    state: "missing",
    path: null,
    digest: null,
    detail: "No observation bundle supplied.",
  },
  localSurfaceEvidence = {
    healthEndpoint: {
      status: "block",
      source: null,
      observedAt: null,
      digest: null,
      detail: "Local health-route evidence was not supplied.",
    },
  },
  maxEvidenceAgeMs = DEFAULT_MAX_AGE_MS,
}) {
  const audit = statusCounts(auditItems);
  const innovations = statusCounts(innovationItems);
  const pendingWork = [...auditItems, ...innovationItems]
    .filter(
      (item) =>
        !["shipped", "done", "deferred", "blocked", "human-blocked"].includes(
          String(item.status ?? "pending"),
        ),
    )
    .map((item) => item.slug ?? item.id ?? item.title);
  const budgetStatus =
    transfer.initial.gzipBytes <= transfer.initial.maxGzipBytes &&
    transfer.initial.brotliBytes <= transfer.initial.maxBrotliBytes &&
    transfer.media.totalBytes <= transfer.media.maxTotalBytes &&
    transfer.media.largestBytes <= transfer.media.maxFileBytes
      ? "pass"
      : "fail";
  const launchGates = evaluateCanonicalReleaseGates(releaseObservations, {
    now: Date.parse(generatedAt),
    maxAgeMs: maxEvidenceAgeMs,
  });
  const releaseBlockers = [...launchGates.blockers];
  if (localSurfaceEvidence.healthEndpoint.status !== "pass") {
    releaseBlockers.push(
      `healthEndpoint: ${localSurfaceEvidence.healthEndpoint.detail}`,
    );
  }
  if (pendingWork.length > 0)
    releaseBlockers.push(`work: ${pendingWork.length} pending item(s)`);
  if (budgetStatus !== "pass") releaseBlockers.push("transfer: budget failed");
  if (dirty) releaseBlockers.push("source: working tree is dirty");

  const evidenceCore = {
    schemaVersion: "2.0",
    project: "vaultfront",
    generatedAt,
    status: releaseBlockers.length === 0 ? "ready" : "blocked",
    blockers: releaseBlockers,
    source: {
      gitSha,
      dirty,
      revisionContract: "org.opencontainers.image.revision",
      observationBundle,
    },
    launch: {
      mode: "join-alpha",
      status: launchGates.status,
      runtimeAdvertised: false,
      liveOriginVerified:
        launchGates.gates.find((gate) => gate.gate === "staging")?.status ===
        "pass",
      ...launchGates,
    },
    localSurface: localSurfaceEvidence,
    work: {
      auditSource,
      audit,
      innovations,
      exhausted: pendingWork.length === 0,
      pendingWork,
    },
    transfer: { ...transfer, status: budgetStatus },
  };
  const lineageEvidence = {
    source: evidenceCore.source,
    launch: evidenceCore.launch,
    "local-surface": evidenceCore.localSurface,
    work: evidenceCore.work,
    transfer: evidenceCore.transfer,
    "release-decision": {
      status: evidenceCore.status,
      blockers: evidenceCore.blockers,
    },
  };
  const lineage = buildEvidenceLineage([
    {
      id: "source",
      kind: "provenance",
      evidence: lineageEvidence.source,
    },
    {
      id: "launch",
      kind: "external-gates",
      parents: ["source"],
      evidence: lineageEvidence.launch,
    },
    {
      id: "local-surface",
      kind: "executable-local-gates",
      parents: ["source"],
      evidence: lineageEvidence["local-surface"],
    },
    {
      id: "work",
      kind: "exhaustion",
      parents: ["source"],
      evidence: lineageEvidence.work,
    },
    {
      id: "transfer",
      kind: "budget",
      parents: ["source"],
      evidence: lineageEvidence.transfer,
    },
    {
      id: "release-decision",
      kind: "decision",
      parents: ["launch", "local-surface", "work", "transfer"],
      evidence: lineageEvidence["release-decision"],
    },
  ]);
  if (!verifyEvidenceLineage(lineage, lineageEvidence))
    throw new Error("release-evidence-lineage-self-verification-failed");
  const evidence = { ...evidenceCore, lineage };
  return { ...evidence, evidenceDigest: digest(evidence) };
}

export function verifyReleaseEvidenceLineage(evidence) {
  if (!evidence?.lineage) return false;
  return verifyEvidenceLineage(evidence.lineage, {
    source: evidence.source,
    launch: evidence.launch,
    "local-surface": evidence.localSurface,
    work: evidence.work,
    transfer: evidence.transfer,
    "release-decision": {
      status: evidence.status,
      blockers: evidence.blockers,
    },
  });
}

function git(args, cwd = root) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0 ? String(result.stdout).trim() : "unknown";
}

export function generateReleaseEvidence(projectRoot = root) {
  const generatedAt = new Date().toISOString();
  const staticRoot = path.join(projectRoot, "static");
  const config = JSON.parse(
    fs.readFileSync(path.join(projectRoot, ".bundlewatch.json"), "utf8"),
  );
  const htmlPath = config.initialEntry.html;
  const html = fs.readFileSync(path.join(projectRoot, htmlPath), "utf8");
  const initial = measureCompressedAssets(
    projectRoot,
    extractInitialEntryAssetPaths(html, htmlPath),
  );
  const media = measureMediaAssets(
    projectRoot,
    config.media.root,
    config.media.extensions,
  );
  const latestAudit = findLatestAuditSidecar(projectRoot);
  const innovationPath = path.join(projectRoot, "docs", "INNOVATION_PACK.json");
  const innovations = fs.existsSync(innovationPath)
    ? (JSON.parse(fs.readFileSync(innovationPath, "utf8")).items ?? [])
    : [];
  const variance = config.initialEntry.crossPlatformVariancePercent ?? 0;
  const baselineGzipBytes =
    config.initialEntry.baselineGzipBytes ?? config.initialEntry.maxGzipBytes;
  const baselineBrotliBytes =
    config.initialEntry.baselineBrotliBytes ??
    config.initialEntry.maxBrotliBytes;
  const observationBundle = loadReleaseGateObservations(projectRoot);
  const localSurfaceEvidence = buildLocalSurfaceEvidence(
    projectRoot,
    generatedAt,
  );
  const releaseObservations = {
    ...observationBundle.observations,
    footerManifest: localSurfaceEvidence.footerManifest,
  };
  const evidence = buildReleaseEvidence({
    generatedAt,
    gitSha: git(["rev-parse", "HEAD"], projectRoot),
    dirty: git(["status", "--porcelain"], projectRoot).length > 0,
    auditSource: latestAudit ? `docs/AUDIT_${latestAudit.date}.json` : null,
    auditItems: latestAudit?.audit?.items ?? [],
    innovationItems: innovations,
    observationBundle: {
      state: observationBundle.state,
      path: observationBundle.path,
      digest: observationBundle.digest,
      detail: observationBundle.detail,
    },
    releaseObservations,
    localSurfaceEvidence,
    transfer: {
      initial: {
        ...initial,
        baselineGzipBytes,
        baselineBrotliBytes,
        crossPlatformVariancePercent: variance,
        maxGzipBytes: effectiveByteLimit(baselineGzipBytes, variance),
        maxBrotliBytes: effectiveByteLimit(baselineBrotliBytes, variance),
      },
      media: {
        totalBytes: media.totalBytes,
        largestBytes: media.maxFileBytes,
        maxTotalBytes: config.media.maxTotalBytes,
        maxFileBytes: config.media.maxFileBytes,
      },
    },
  });
  fs.mkdirSync(staticRoot, { recursive: true });
  const output = path.join(staticRoot, "release-evidence.json");
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return { output, evidence };
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  try {
    const { output, evidence } = generateReleaseEvidence();
    console.log(
      `release evidence: ${path.relative(root, output)} · release=${evidence.status} · external=${evidence.launch.status} · blockers=${evidence.blockers.length} · transfer=${evidence.transfer.status} · exhausted=${evidence.work.exhausted} · dirty=${evidence.source.dirty}`,
    );
    for (const blocker of evidence.blockers) console.log(`  BLOCK ${blocker}`);
    // Artifact generation remains build-safe while launch readiness fails closed in-band.
    process.exitCode = evidence.transfer.status === "pass" ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
