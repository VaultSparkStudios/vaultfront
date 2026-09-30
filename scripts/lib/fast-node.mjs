// fast-node.mjs — S292 [audit #1]. Spend the spawn tax once instead of 191 times.
//
// WHY THIS EXISTS
// ---------------
// S291 measured, and this session re-measured live, a path-specific tax on the
// installed node binary: `node --version` from `C:\Program Files\nodejs\` costs
// 900-1900 ms, while a BYTE-IDENTICAL copy of the same file costs 60-190 ms from
// the user home, this repo, or AppData. Neither the machine, nor the image, nor
// the install layout explains it (a full install clone with node_modules and
// corepack runs in 155 ms). At ~800-1150 ms of avoidable cost per invocation the
// doctor (~191 spawns) burns ~158-219 s and the suite (~400) ~330 s per run.
//
// S291 shipped the INSTRUMENT for that (`node-spawn-tax.mjs`) but no mitigation,
// and the only remedy it printed was a Defender exclusion — which that same
// session ruled out by live experiment (commit b3f73dd5) and which D-S183.5 had
// already REJECTED as studio policy ("it would blind the AV to real threats").
// The instrument's own control arm was the fix all along: it creates a fast
// byte-identical copy, measures it, and then deletes it.
//
// WHAT THIS MODULE GUARANTEES — and what it does not
// --------------------------------------------------
// Provisioning (`provision-fast-node.mjs`) copies the installed binary, hashes
// BOTH files in full, and records the pair plus each file's size+mtime. This
// module then resolves that clone only while both files still match the recorded
// size+mtime. So the guarantee is precise:
//
//   "these two files are unchanged since we read them in full and found them
//    byte-identical, and they report the same process.version"
//
// It is NOT a re-hash on every call (that would cost more than the tax it
// saves). A clone edited in place while preserving size AND mtime would defeat
// it; nothing in this repo does that, and the store lives under the user's own
// home directory.
//
// FAIL-CLOSED IN THE ONLY DIRECTION THAT MATTERS
// ----------------------------------------------
// Every failure — no store, version drift, size/mtime drift, unreadable sidecar,
// non-Windows host, opt-out set — resolves to `process.execPath`, the binary
// that would have run anyway. This module can make the studio slower than
// intended; it can never make it run a different node. It never provisions, and
// it never throws into a spawn path.
//
// Opt out for a session:  VAULTSPARK_FAST_NODE=0

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

/** Root of the machine-local store. Outside any repo on purpose: it is a cache of
 *  a machine-global binary, not project state, and must never be committed. */
export function fastNodeRoot() {
  return process.env.VAULTSPARK_FAST_NODE_DIR
    || path.join(os.homedir(), '.vaultspark', 'fast-node');
}

/** Version-keyed, so a node upgrade can never silently keep running the old copy. */
export function fastNodeDir(version = process.version) {
  return path.join(fastNodeRoot(), version);
}

export function sidecarPath(version = process.version) {
  return path.join(fastNodeDir(version), 'provenance.json');
}

export function sha256File(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

/** size+mtimeMs identity for a file, or null if it cannot be stat'd. */
export function fileStamp(file) {
  try {
    const s = fs.statSync(file);
    return { size: s.size, mtimeMs: Math.round(s.mtimeMs) };
  } catch {
    return null;
  }
}

function stampsMatch(a, b) {
  return !!a && !!b && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

/**
 * Resolve the fast node for `execPath`, with the reason either way.
 * Pure and side-effect free: it reads, it never writes and never provisions.
 *
 * @returns {{path: string, fast: boolean, state: string, reason: string, sidecar?: object}}
 */
export function resolveFastNode({
  execPath = process.execPath,
  version = process.version,
  platform = process.platform,
  env = process.env,
} = {}) {
  const fallback = (state, reason) => ({ path: execPath, fast: false, state, reason });

  if (env.VAULTSPARK_FAST_NODE === '0') return fallback('opted-out', 'VAULTSPARK_FAST_NODE=0');
  // The tax is a Windows path-specific effect. Elsewhere there is nothing measured
  // to mitigate, and substituting would add risk for no evidence of benefit.
  if (platform !== 'win32') return fallback('not-applicable', `platform ${platform} — tax measured only on win32`);

  const sc = sidecarPath(version);
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(sc, 'utf8'));
  } catch (err) {
    return fallback('unprovisioned',
      `no verified clone for ${version} (${err?.code || 'unreadable'}) — run: node scripts/provision-fast-node.mjs --apply`);
  }

  if (meta.version !== version) {
    return fallback('version-drift', `store holds ${meta.version}, running ${version} — re-provision`);
  }
  if (meta.installedPath !== execPath) {
    return fallback('source-drift', `store was cut from ${meta.installedPath}, running ${execPath} — re-provision`);
  }
  if (meta.installedSha256 !== meta.cloneSha256) {
    // Should be impossible — provisioning refuses to write this. Treated as
    // corruption rather than trusted, because a mismatch here is the one thing
    // that could put a different binary on the spawn path.
    return fallback('hash-mismatch', 'recorded hashes differ — clone is not the installed binary; re-provision');
  }

  const clone = meta.clonePath;
  const nowInstalled = fileStamp(execPath);
  const nowClone = fileStamp(clone);
  if (!nowClone) return fallback('clone-missing', `clone absent at ${clone} — re-provision`);
  if (!stampsMatch(nowInstalled, meta.installedStamp)) {
    return fallback('installed-changed',
      'installed node changed since verification (size/mtime) — re-provision before trusting the clone');
  }
  if (!stampsMatch(nowClone, meta.cloneStamp)) {
    return fallback('clone-changed', 'clone changed since verification (size/mtime) — re-provision');
  }

  return {
    path: clone,
    fast: true,
    state: 'verified',
    reason: `byte-identical ${version} clone, verified ${meta.verifiedAt}`,
    sidecar: meta,
  };
}

// Memoised per process: the resolve above reads a small JSON and stats two files.
// Doing that once per spawn would be waste on a hot path that fires ~191 times.
let _cached = null;
export function fastNodePath(execPath = process.execPath) {
  if (_cached && _cached.forExecPath === execPath) {
    // Cheap liveness check only — a full re-verify per spawn would cost more than
    // the tax it saves, and an absent clone must degrade rather than ENOENT.
    if (!_cached.fast || fs.existsSync(_cached.path)) return _cached.path;
    _cached = null;
  }
  const r = resolveFastNode({ execPath });
  _cached = { ...r, forExecPath: execPath };
  return r.path;
}

/** Test seam — drop the per-process memo. */
export function _resetFastNodeCache() { _cached = null; }

export default { fastNodeRoot, fastNodeDir, sidecarPath, sha256File, fileStamp, resolveFastNode, fastNodePath, _resetFastNodeCache };
