import fs from "node:fs";
import path from "node:path";

export function sidecarPath(root, date) {
  return path.join(root, "docs", `AUDIT_${date}.json`);
}

export function readAuditSidecar(root, date) {
  try {
    return JSON.parse(fs.readFileSync(sidecarPath(root, date), "utf8"));
  } catch {
    return null;
  }
}

export function writeAuditSidecar(root, date, audit) {
  const output = {
    ...audit,
    schemaVersion: audit.schemaVersion ?? "1.0",
    generatedAt: audit.generatedAt ?? new Date().toISOString(),
  };
  const target = sidecarPath(root, date);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
  return target;
}

export function findLatestAuditSidecar(root) {
  const dir = path.join(root, "docs");
  if (!fs.existsSync(dir)) return null;
  const file = fs
    .readdirSync(dir)
    .filter((name) => /^AUDIT_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .at(-1);
  if (!file) return null;
  const date = file.slice(6, 16);
  return { date, audit: readAuditSidecar(root, date) };
}

export function mergeAudit(existing, incoming) {
  if (!existing) return incoming;
  const priorBySlug = new Map(
    (existing.items ?? []).map((item) => [item.slug, item]),
  );
  const items = (incoming.items ?? []).map((item) => {
    const prior = priorBySlug.get(item.slug);
    priorBySlug.delete(item.slug);
    return prior
      ? {
          ...item,
          status:
            prior.status === "shipped" ? "shipped" : (item.status ?? "pending"),
          executionLog: prior.executionLog ?? [],
        }
      : { ...item, status: item.status ?? "pending", executionLog: [] };
  });
  items.push(...priorBySlug.values());
  return { ...incoming, items };
}

export function appendExecution(audit, slug, entry) {
  const item = audit.items?.find((candidate) => candidate.slug === slug);
  if (!item) return null;
  item.executionLog ??= [];
  const normalized = { at: new Date().toISOString(), ...entry };
  item.executionLog.push(normalized);
  if (normalized.status) item.status = normalized.status;
  return item;
}
