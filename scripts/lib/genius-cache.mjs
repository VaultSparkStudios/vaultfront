import fs from "node:fs";

export const GENIUS_CACHE_SCHEMA_VERSION = "1.0";
const SUPPORTED_SCHEMA_VERSIONS = new Set([GENIUS_CACHE_SCHEMA_VERSION]);
const FINISHED_STATUSES = new Set(["done", "shipped", "complete", "completed"]);
const BLOCKED_STATUSES = new Set(["blocked", "human-blocked"]);

export function parseGeniusCache(input) {
  const payload = typeof input === "string" ? JSON.parse(input) : input;
  if (!payload || typeof payload !== "object") {
    throw new TypeError("Genius cache must be a JSON object");
  }
  if (
    payload.schemaVersion &&
    !SUPPORTED_SCHEMA_VERSIONS.has(String(payload.schemaVersion))
  ) {
    throw new Error(
      `Unsupported genius cache schemaVersion '${payload.schemaVersion}'`,
    );
  }

  const items = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.list?.ranked)
      ? payload.list.ranked
      : Array.isArray(payload.ranked)
        ? payload.ranked
        : null;
  if (!items) {
    throw new Error(
      "Genius cache has no supported item collection (items, list.ranked, ranked)",
    );
  }
  return {
    schemaVersion: payload.schemaVersion ?? "legacy",
    generatedAt: payload.generatedAt ?? null,
    project: payload.project ?? null,
    items,
    raw: payload,
  };
}

export function readGeniusCache(cachePath) {
  return parseGeniusCache(fs.readFileSync(cachePath, "utf8"));
}

export function isPendingUnblocked(item) {
  const status = String(item?.status ?? "pending").toLowerCase();
  return (
    !item?.blocked &&
    !FINISHED_STATUSES.has(status) &&
    !BLOCKED_STATUSES.has(status) &&
    status !== "deferred"
  );
}

export function selectFirstPendingUnblocked(cache) {
  const parsed = cache?.items ? cache : parseGeniusCache(cache);
  return parsed.items.find(isPendingUnblocked) ?? null;
}
