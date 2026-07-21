import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const INTERNAL_EXEMPTION_RE =
  /(?:exempt\s*\(\s*internal\s*\)|exempt[-_ ]internal|internal[-_ ]exempt)/i;

export function isPublicAudience(audience) {
  return /^public(?:-|$)/i.test(String(audience ?? "").trim());
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
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

function normalized(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function addMismatch(contradictions, field, expected, actual) {
  if (!normalized(expected) || !normalized(actual)) return;
  if (normalized(expected) === normalized(actual)) return;
  contradictions.push({
    id: "project-manifest-identity-mismatch",
    source: `context/STUDIO_MANIFEST.json#identity.${field}`,
    detail: `PROJECT_STATUS ${field} '${expected}' conflicts with generated manifest '${actual}'.`,
  });
}

export function evaluateProjectTruth({
  status = {},
  canonAdoption = "",
  studioManifest = null,
} = {}) {
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

  if (studioManifest?.identity) {
    addMismatch(
      contradictions,
      "type",
      status.type,
      studioManifest.identity.type,
    );
    addMismatch(
      contradictions,
      "audience",
      status.audience,
      studioManifest.identity.audience,
    );
    addMismatch(
      contradictions,
      "lifecycle",
      status.lifecycle,
      studioManifest.identity.lifecycle,
    );
  }

  if (isPublicAudience(audience) && studioManifest) {
    const publicMetadata = studioManifest.publicMetadata ?? {};
    if (publicMetadata.privateByDefault === true) {
      contradictions.push({
        id: "public-manifest-private-posture",
        source: "context/STUDIO_MANIFEST.json#publicMetadata.privateByDefault",
        detail:
          "A public repository cannot advertise a private-by-default release posture.",
      });
    }
    if (publicMetadata.brandingRequired !== true) {
      contradictions.push({
        id: "public-manifest-branding-disabled",
        source: "context/STUDIO_MANIFEST.json#publicMetadata.brandingRequired",
        detail: "Public VaultFront surfaces require VaultSpark branding.",
      });
    }
    if (publicMetadata.publicRepoSanitized !== true) {
      contradictions.push({
        id: "public-manifest-sanitization-stale",
        source:
          "context/STUDIO_MANIFEST.json#publicMetadata.publicRepoSanitized",
        detail:
          "The generated manifest does not reflect the repository's cleared public sanitization posture.",
      });
    }
    const categories = studioManifest.listingMetadata?.categories ?? [];
    if (categories.some((category) => normalized(category) === "internal")) {
      contradictions.push({
        id: "public-manifest-internal-category",
        source: "context/STUDIO_MANIFEST.json#listingMetadata.categories",
        detail:
          "Public-unlaunched VaultFront is still categorized as internal.",
      });
    }
    if (publicMetadata.publicReady === true && /unlaunched/i.test(audience)) {
      contradictions.push({
        id: "public-manifest-premature-ready",
        source: "context/STUDIO_MANIFEST.json#publicMetadata.publicReady",
        detail: `Audience '${audience}' conflicts with publicReady=true.`,
      });
    }
  }

  return {
    ok: contradictions.length === 0,
    audience,
    manifestAudience: studioManifest?.identity?.audience ?? null,
    contradictions,
  };
}

export function buildProjectTruthFingerprint({
  status = {},
  studioManifest = null,
  footerManifest = null,
  sourceDigests = {},
} = {}) {
  const evaluation = evaluateProjectTruth({ status, studioManifest });
  const missingSourceDigests = Object.entries(sourceDigests)
    .filter(([, value]) => !/^sha256:[0-9a-f]{64}$/i.test(String(value ?? "")))
    .map(([key]) => key);
  const contract = {
    schemaVersion: 1,
    identity: {
      type: status.type ?? null,
      lifecycle: status.lifecycle ?? null,
      audience: status.audience ?? null,
      stage: status.stage ?? null,
    },
    manifestIdentity: studioManifest?.identity ?? null,
    publicMetadata: studioManifest?.publicMetadata ?? null,
    footerContract: footerManifest
      ? {
          schemaVersion: footerManifest.schemaVersion ?? null,
          pageCount: footerManifest.pages?.length ?? 0,
          headerLinkCount: footerManifest.headerLinks?.length ?? 0,
          footerLinkCount: footerManifest.footerLinks?.length ?? 0,
        }
      : null,
    sourceDigests,
    evaluation: {
      ok: evaluation.ok && missingSourceDigests.length === 0,
      audience: evaluation.audience,
      manifestAudience: evaluation.manifestAudience,
      contradictionIds: [
        ...evaluation.contradictions.map((item) => item.id),
        ...missingSourceDigests.map(
          (key) => `project-truth-source-missing:${key}`,
        ),
      ],
    },
  };
  const canonical = JSON.stringify(canonicalize(contract));
  return {
    ...contract,
    fingerprint: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
  };
}

export function readProjectTruthInputs(root) {
  const statusPath = path.join(root, "context", "PROJECT_STATUS.json");
  const canonPath = path.join(root, "context", "CANON_ADOPTION.md");
  const manifestPath = path.join(root, "context", "STUDIO_MANIFEST.json");
  let status = {};
  let canonAdoption = "";
  let studioManifest = null;
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
  if (fs.existsSync(manifestPath)) {
    try {
      studioManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (error) {
      warnings.push(
        `Unable to read context/STUDIO_MANIFEST.json: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { status, canonAdoption, studioManifest, warnings };
}
