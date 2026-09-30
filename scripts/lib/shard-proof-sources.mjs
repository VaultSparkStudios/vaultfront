// shard-proof-sources.mjs — source-bound input declarations for resumable test shards.
//
// Static local imports and explicit repository-path literals bind an implementation
// source to every shard that declares it. Runner inputs are shared by every shard.
// Any inventory source not claimed by either rule gets one deterministic owner shard,
// so a source byte change can never disappear behind a stale aggregate green.
import fs from 'node:fs';
import path from 'node:path';
import { buildProofSourceManifest, buildProofSourceManifestFromEntries, proofSourceInventory } from './proof-source-manifest.mjs';

const MODULE_EXTENSIONS = ['', '.mjs', '.cjs', '.js', '.ts', '.json', '.yml', '.yaml'];
const MODULE_REFERENCE = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\()\s*['"]([^'"]+)['"]/g;
const REPO_PATH_REFERENCE = /['"]((?:scripts|ignis\/src|\.github\/workflows)\/[^'"?#]+)['"]/g;

function normalize(value) {
  return String(value || '').replace(/\\/g, '/');
}

function fnv1a(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveInventoryReference(fromRel, specifier, inventory) {
  if (!specifier.startsWith('.')) return null;
  const base = normalize(path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier)));
  for (const ext of MODULE_EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (inventory.has(candidate)) return candidate;
  }
  for (const ext of MODULE_EXTENSIONS.slice(1)) {
    const candidate = `${base}/index${ext}`;
    if (inventory.has(candidate)) return candidate;
  }
  return null;
}

export function declaredSourceDependencies(root, entryRel, inventoryPaths = null) {
  const inventory = inventoryPaths instanceof Set
    ? inventoryPaths
    : new Set((inventoryPaths || proofSourceInventory(root).map((row) => row.path)).map(normalize));
  const seen = new Set();
  const pending = [normalize(entryRel)];
  while (pending.length) {
    const rel = pending.pop();
    if (seen.has(rel) || !inventory.has(rel)) continue;
    seen.add(rel);
    let body = '';
    try { body = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    MODULE_REFERENCE.lastIndex = 0;
    for (let match; (match = MODULE_REFERENCE.exec(body));) {
      const resolved = resolveInventoryReference(rel, match[1], inventory);
      if (resolved && !seen.has(resolved)) pending.push(resolved);
    }
    REPO_PATH_REFERENCE.lastIndex = 0;
    for (let match; (match = REPO_PATH_REFERENCE.exec(body));) {
      const referenced = normalize(match[1]);
      if (inventory.has(referenced) && !seen.has(referenced)) pending.push(referenced);
    }
  }
  return seen;
}

export function buildShardSourcePlan(root, files, shardCount, shardIndexForFile) {
  if (!Number.isInteger(shardCount) || shardCount < 1) throw new Error('shardCount must be a positive integer');
  const authenticatedInventory = buildProofSourceManifest(root);
  const inventory = authenticatedInventory.files.map((row) => row.path);
  const inventorySet = new Set(inventory);
  const authenticatedByPath = new Map(authenticatedInventory.files.map((row) => [row.path, row]));
  const shardPaths = Array.from({ length: shardCount }, () => new Set());
  const reasons = Array.from({ length: shardCount }, () => new Map());
  const declare = (index, rel, reason) => {
    if (!inventorySet.has(rel)) return;
    shardPaths[index].add(rel);
    const values = reasons[index].get(rel) || new Set();
    values.add(reason);
    reasons[index].set(rel, values);
  };

  // The runner and its local dependency closure define shard execution semantics.
  const shared = declaredSourceDependencies(root, 'scripts/run-tests.mjs', inventorySet);
  for (let index = 0; index < shardCount; index++) {
    for (const rel of shared) declare(index, rel, 'shared-runner');
    for (const rel of ['package.json', 'ignis/src/package.json']) declare(index, rel, 'shared-runtime');
  }

  for (const file of files) {
    const rel = normalize(path.relative(root, file.path || String(file)));
    const index = shardIndexForFile(file, shardCount);
    for (const dependency of declaredSourceDependencies(root, rel, inventorySet)) {
      declare(index, dependency, dependency === rel ? 'test-entry' : `declared-by:${rel}`);
    }
  }

  // Coverage backstop: unclaimed source bytes still invalidate exactly one shard.
  for (const rel of inventory) {
    if (shardPaths.some((set) => set.has(rel))) continue;
    declare(fnv1a(rel) % shardCount, rel, 'deterministic-owner');
  }

  return shardPaths.map((paths, index) => ({
    shardIndex: index + 1,
    // Derive every shard root from the once-hashed whole-tree inventory. This
    // keeps 64-shard planning O(source files), not O(source files × shards).
    manifest: buildProofSourceManifestFromEntries([...paths].map((rel) => authenticatedByPath.get(rel))),
    declarations: [...reasons[index]].map(([source, why]) => ({ source, reasons: [...why].sort() })),
  }));
}

export function shardDependencyGraph(plan = []) {
  return plan.map((row) => ({
    shardIndex: row.shardIndex,
    sourceCount: row.manifest?.totalFiles || 0,
    sharedCount: (row.declarations || []).filter((entry) => entry.reasons.includes('shared-runner') || entry.reasons.includes('shared-runtime')).length,
    ownedCount: (row.declarations || []).filter((entry) => entry.reasons.includes('deterministic-owner')).length,
  }));
}

export default { declaredSourceDependencies, buildShardSourcePlan, shardDependencyGraph };
