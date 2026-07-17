#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findLatestAuditSidecar } from "./lib/audit-sidecar.mjs";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const finished = new Set(["shipped", "done", "complete", "completed"]);
const nonActionable = new Set(["deferred", "blocked", "human-blocked"]);

export function pendingUnblocked(items = []) {
  return items.filter((item) => {
    const status = String(item.status ?? "pending").toLowerCase();
    return !item.blocked && !finished.has(status) && !nonActionable.has(status);
  });
}

export function evaluateWorkExhaustion({
  auditSource = null,
  auditItems = [],
  innovationSource = null,
  innovationItems = [],
} = {}) {
  const auditPending = pendingUnblocked(auditItems).map(
    (item) => item.slug ?? item.id ?? item.title ?? "unknown-audit-item",
  );
  const innovationPending = pendingUnblocked(innovationItems).map(
    (item) => item.id ?? item.slug ?? item.title ?? "unknown-innovation-item",
  );
  const pending = [
    ...auditPending.map((id) => ({ source: "audit", id })),
    ...innovationPending.map((id) => ({ source: "innovation", id })),
  ];
  return {
    ok: pending.length === 0,
    pendingUnblocked: pending,
    audit: {
      source: auditSource,
      total: auditItems.length,
      pending: auditPending.length,
    },
    innovations: {
      source: innovationSource,
      total: innovationItems.length,
      pending: innovationPending.length,
    },
  };
}

export function readWorkSources(root = defaultRoot) {
  const latestAudit = findLatestAuditSidecar(root);
  const innovationPath = path.join(root, "docs", "INNOVATION_PACK.json");
  const innovation = fs.existsSync(innovationPath)
    ? JSON.parse(fs.readFileSync(innovationPath, "utf8"))
    : { items: [] };
  return {
    auditSource: latestAudit ? `docs/AUDIT_${latestAudit.date}.json` : null,
    auditItems: latestAudit?.audit?.items ?? [],
    innovationSource: fs.existsSync(innovationPath)
      ? "docs/INNOVATION_PACK.json"
      : null,
    innovationItems: innovation.items ?? [],
  };
}

const isDirect =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  const rootIndex = process.argv.indexOf("--root");
  const root =
    rootIndex >= 0 && process.argv[rootIndex + 1]
      ? path.resolve(process.argv[rootIndex + 1])
      : defaultRoot;
  const report = {
    ...evaluateWorkExhaustion(readWorkSources(root)),
    observedAt: new Date().toISOString(),
    source: "scripts/check-work-exhaustion.mjs",
  };
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(
      `Work exhaustion passed: audit ${report.audit.total}/${report.audit.total}, innovations ${report.innovations.total}/${report.innovations.total}.`,
    );
  } else {
    console.error(
      `Work exhaustion failed: ${report.pendingUnblocked.map((item) => `${item.source}:${item.id}`).join(", ")}`,
    );
  }
  process.exit(report.ok ? 0 : 1);
}
