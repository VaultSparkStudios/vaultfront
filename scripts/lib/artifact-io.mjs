// artifact-io.mjs — provenance-stamped artifact read/write (S220 audit #1).
//
// LIVE INCIDENT (S220): a $TEMP/audit-sample.json written by a *veilos* session
// was silently consumed as *this* repo's codebase sample — the audit nearly ran
// on the wrong repo's code. Any cross-repo shared-temp or cache artifact can
// poison a session the same way. Every machine-readable artifact therefore
// embeds { root, repo, producer, generatedAt }; consumers verify root matches
// cwd and the artifact is not stale before trusting it.
//
// API:
//   writeArtifact(file, data, { producer })    — stamp __provenance and write
//   readArtifact(file, { maxAgeMs, expectRoot, allowForeign }) →
//     { ok, data, reason?, provenance? }       — never throws on mismatch;
//                                                returns ok:false with reason
//   scratchPath(name)                          — repo-slug-namespaced temp path
//   stampProvenance(data, { producer })        — stamp without writing (stdout emitters)
//
// Rollback: consumers fall back to raw JSON.parse when __provenance is absent
// (ok:true, provenance:null) — adopting the helper is non-breaking.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function repoRoot() {
  // Walk up from cwd to the nearest .git directory; fall back to cwd.
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function repoSlug(root = repoRoot()) {
  return path.basename(root).toLowerCase();
}

export function stampProvenance(data, { producer = 'unknown', root = repoRoot() } = {}) {
  return {
    ...data,
    __provenance: {
      root,
      repo: repoSlug(root),
      producer,
      generatedAt: new Date().toISOString(),
    },
  };
}

// S264: all artifact writes are ATOMIC (tmp + rename on the same volume) and
// wipe-guarded. Live incident: context/COMPLIANCE_HISTORY.json was found
// truncated to 0 bytes mid-session — a plain writeFileSync interrupted (or
// interleaved with a concurrent probe) leaves a partial file, and the next
// reader's `{snapshots:[]}` fallback then makes the wipe permanent.
function atomicWriteFileSync(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  fs.writeFileSync(tmp, content);
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw err;
  }
}

export function writeArtifact(file, data, opts = {}) {
  const stamped = stampProvenance(data, opts);
  const content = JSON.stringify(stamped, null, 2);
  if (opts.guard !== false) guardAgainstWipe(file, content, opts);
  atomicWriteFileSync(file, content);
  return stamped.__provenance;
}

/**
 * writeTextArtifact(file, content, opts?) — atomic, wipe-guarded write for
 * generated text/markdown artifacts (no provenance stamping — text formats
 * carry their own generator comments).
 */
export function writeTextArtifact(file, content, opts = {}) {
  if (opts.guard !== false) guardAgainstWipe(file, content, opts);
  atomicWriteFileSync(file, String(content));
}

function guardAgainstWipe(file, content, opts = {}) {
  // Lazy import keeps artifact-io dependency-light for consumers that only read.
  try {
    if (!fs.existsSync(file)) return;
    const existing = fs.readFileSync(file, 'utf8');
    if (existing.length === 0) return; // already empty — any write is recovery
    const ratio = content.length / existing.length;
    const threshold = opts.threshold ?? 0.3;
    if (ratio < threshold) {
      throw new Error(
        `artifact-io wipe-guard: ${file} would shrink to ${(ratio * 100).toFixed(1)}% of current size ` +
        `(threshold ${(threshold * 100).toFixed(0)}%) — refusing a probable degraded-scan/partial-state publish. ` +
        `Pass { guard:false } ONLY with a logged reason.`,
      );
    }
  } catch (err) {
    if (String(err.message || '').includes('wipe-guard')) throw err;
    // Unreadable existing file: do not block recovery writes.
  }
}

/**
 * Read a JSON artifact and verify provenance.
 * Never throws on provenance mismatch — returns { ok:false, reason } so
 * consumers decide (skip, warn, regenerate). Unstamped artifacts pass with
 * provenance:null (non-breaking adoption path).
 */
export function readArtifact(file, opts = {}) {
  const {
    maxAgeMs = null,
    expectRoot = repoRoot(),
    allowForeign = false,
  } = opts;
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, reason: 'missing', data: null, provenance: null };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'unparseable', data: null, provenance: null };
  }
  const prov = data?.__provenance ?? null;

  // ── S301 [audit #15] — AN AGE CONTRACT MUST NOT BE SATISFIED BY SILENCE ─────
  //
  // This returned `{ ok:true }` for any unstamped artifact, BEFORE the maxAgeMs
  // check — so a caller that explicitly asked for freshness got "fresh" for a
  // file of any age, purely because it lacked a provenance stamp. Measured live:
  // portfolio/DEPLOY_GAPS.json carries a top-level generatedAt of 2026-04-26 and
  // no stamp at all, and every /start rendered a deploy-divergence verdict from
  // it for 119 days — naming vaultspark-football-gm, a slug that no longer
  // exists, while the two newest SPARKED repos had never been checked.
  //
  // Requesting no maxAgeMs still passes unstamped artifacts (the legacy adoption
  // path is unchanged). Requesting one now means it: a top-level date field is
  // accepted as the fallback, and an artifact with no date at all is `undated`,
  // never fresh. Unknown must never mean go-live.
  const stampedAt = prov?.generatedAt
    || (typeof data?.generatedAt === 'string' ? data.generatedAt : null)
    || (typeof data?.checkedAt === 'string' ? data.checkedAt : null)
    || (typeof data?.lastUpdated === 'string' ? data.lastUpdated : null);

  if (!prov) {
    if (maxAgeMs == null) return { ok: true, data, provenance: null };
    if (!stampedAt) {
      return { ok: false, reason: 'undated: no provenance stamp and no generatedAt — freshness cannot be established', data, provenance: null };
    }
  } else if (!allowForeign && prov.root && expectRoot &&
      path.resolve(prov.root).toLowerCase() !== path.resolve(expectRoot).toLowerCase()) {
    return { ok: false, reason: `foreign-root: artifact from ${prov.repo ?? prov.root}, expected ${repoSlug(expectRoot)}`, data, provenance: prov };
  }

  if (maxAgeMs != null && stampedAt) {
    const age = Date.now() - Date.parse(stampedAt);
    if (Number.isFinite(age) && age > maxAgeMs) {
      return { ok: false, reason: `stale: ${Math.round(age / 3_600_000)}h old (max ${Math.round(maxAgeMs / 3_600_000)}h)`, data, provenance: prov, ageMs: age };
    }
  }
  return { ok: true, data, provenance: prov, ageMs: stampedAt ? Date.now() - Date.parse(stampedAt) : null };
}

/** Repo-namespaced scratch path — two repos can never collide on a bare name. */
export function scratchPath(name) {
  const dir = path.join(os.tmpdir(), 'studio-scratch', repoSlug());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}
