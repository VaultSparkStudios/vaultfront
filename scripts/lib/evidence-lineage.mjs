import { createHash } from "node:crypto";

const MAX_NODES = 64;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("evidence-lineage-non-finite-number");
  if (["function", "symbol", "bigint"].includes(typeof value))
    throw new Error(`evidence-lineage-unsupported:${typeof value}`);
  return value;
}

export function evidenceLineageDigest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

export function buildEvidenceLineage(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0)
    throw new Error("evidence-lineage-empty");
  if (definitions.length > MAX_NODES)
    throw new Error("evidence-lineage-node-limit");
  const known = new Set();
  const nodes = definitions.map((definition) => {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(definition.id ?? ""))
      throw new Error(`evidence-lineage-invalid-id:${definition.id}`);
    if (known.has(definition.id))
      throw new Error(`evidence-lineage-duplicate:${definition.id}`);
    const parents = [...new Set(definition.parents ?? [])].sort();
    for (const parent of parents) {
      if (!known.has(parent))
        throw new Error(`evidence-lineage-missing-or-forward-parent:${parent}`);
    }
    const core = {
      id: definition.id,
      kind: definition.kind ?? "evidence",
      parents,
      contentDigest: evidenceLineageDigest(definition.evidence),
    };
    const node = { ...core, receiptDigest: evidenceLineageDigest(core) };
    known.add(definition.id);
    return node;
  });
  const rootDigest = evidenceLineageDigest(
    nodes.map(({ id, receiptDigest }) => ({ id, receiptDigest })),
  );
  return {
    schemaVersion: "1.0",
    algorithm: "sha256-canonical-json-dag-v1",
    nodes,
    rootDigest,
  };
}

export function verifyEvidenceLineage(lineage, evidenceById = null) {
  try {
    if (
      lineage?.schemaVersion !== "1.0" ||
      lineage.algorithm !== "sha256-canonical-json-dag-v1" ||
      !Array.isArray(lineage.nodes) ||
      lineage.nodes.length === 0 ||
      lineage.nodes.length > MAX_NODES
    )
      return false;
    const known = new Set();
    for (const node of lineage.nodes) {
      if (known.has(node.id)) return false;
      if (!Array.isArray(node.parents)) return false;
      if (node.parents.some((parent) => !known.has(parent))) return false;
      const core = {
        id: node.id,
        kind: node.kind,
        parents: [...new Set(node.parents)].sort(),
        contentDigest: node.contentDigest,
      };
      if (
        evidenceById &&
        Object.hasOwn(evidenceById, node.id) &&
        node.contentDigest !== evidenceLineageDigest(evidenceById[node.id])
      )
        return false;
      if (node.receiptDigest !== evidenceLineageDigest(core)) return false;
      known.add(node.id);
    }
    return (
      lineage.rootDigest ===
      evidenceLineageDigest(
        lineage.nodes.map(({ id, receiptDigest }) => ({ id, receiptDigest })),
      )
    );
  } catch {
    return false;
  }
}
