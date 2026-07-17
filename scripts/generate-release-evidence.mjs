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
import { findLatestAuditSidecar } from "./lib/audit-sidecar.mjs";
import { spawnSync } from "./lib/safe-spawn.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function statusCounts(items = []) {
  return items.reduce((counts, item) => {
    const status = String(item.status ?? "pending");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildReleaseEvidence({
  generatedAt,
  gitSha,
  dirty,
  auditSource,
  auditItems,
  innovationItems,
  transfer,
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
  const evidence = {
    schemaVersion: "1.0",
    project: "vaultfront",
    generatedAt,
    source: {
      gitSha,
      dirty,
      revisionContract: "org.opencontainers.image.revision",
    },
    launch: {
      mode: "join-alpha",
      runtimeAdvertised: false,
      liveOriginVerified: false,
    },
    work: {
      auditSource,
      audit,
      innovations,
      exhausted: pendingWork.length === 0,
      pendingWork,
    },
    transfer: { ...transfer, status: budgetStatus },
  };
  return { ...evidence, evidenceDigest: digest(evidence) };
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  return result.status === 0 ? String(result.stdout).trim() : "unknown";
}

export function generateReleaseEvidence(projectRoot = root) {
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
  const evidence = buildReleaseEvidence({
    generatedAt: new Date().toISOString(),
    gitSha: git(["rev-parse", "HEAD"]),
    dirty: git(["status", "--porcelain"]).length > 0,
    auditSource: latestAudit ? `docs/AUDIT_${latestAudit.date}.json` : null,
    auditItems: latestAudit?.audit?.items ?? [],
    innovationItems: innovations,
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
      `release evidence: ${path.relative(root, output)} · transfer=${evidence.transfer.status} · exhausted=${evidence.work.exhausted} · dirty=${evidence.source.dirty}`,
    );
    process.exitCode = evidence.transfer.status === "pass" ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
