import fs from "node:fs";
import path from "node:path";

const INTERNAL_EXEMPTION_RE =
  /(?:exempt\s*\(\s*internal\s*\)|exempt[-_ ]internal|internal[-_ ]exempt)/i;

export function isPublicAudience(audience) {
  return /^public(?:-|$)/i.test(String(audience ?? "").trim());
}

function flatten(value, prefix = "") {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      flatten(entry, `${prefix}[${index}]`),
    );
  }
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      flatten(entry, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [{ path: prefix || "value", value: String(value) }];
}

export function evaluateProjectTruth({ status = {}, canonAdoption = "" } = {}) {
  const audience = status.audience ?? "unknown";
  const contradictions = [];

  if (isPublicAudience(audience)) {
    for (const entry of flatten(status)) {
      if (!INTERNAL_EXEMPTION_RE.test(entry.value)) continue;
      contradictions.push({
        id: "public-audience-internal-exemption",
        source: `context/PROJECT_STATUS.json#${entry.path}`,
        detail: `Public audience '${audience}' conflicts with '${entry.value}'.`,
      });
    }

    for (const [index, line] of String(canonAdoption)
      .split(/\r?\n/u)
      .entries()) {
      if (!INTERNAL_EXEMPTION_RE.test(line)) continue;
      contradictions.push({
        id: "public-audience-internal-exemption",
        source: `context/CANON_ADOPTION.md:${index + 1}`,
        detail: `Public audience '${audience}' conflicts with an internal exemption: ${line.trim()}`,
      });
    }
  }

  return {
    ok: contradictions.length === 0,
    audience,
    contradictions,
  };
}

export function readProjectTruthInputs(root) {
  const statusPath = path.join(root, "context", "PROJECT_STATUS.json");
  const canonPath = path.join(root, "context", "CANON_ADOPTION.md");
  let status = {};
  let canonAdoption = "";
  const warnings = [];

  try {
    status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
  } catch (error) {
    warnings.push(
      `Unable to read context/PROJECT_STATUS.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    canonAdoption = fs.readFileSync(canonPath, "utf8");
  } catch (error) {
    warnings.push(
      `Unable to read context/CANON_ADOPTION.md: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { status, canonAdoption, warnings };
}
