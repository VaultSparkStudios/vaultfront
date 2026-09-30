#!/usr/bin/env node
/**
 * write-project-status.mjs — shared write-path for context/PROJECT_STATUS.json
 * (S154 audit #10 · root-fixes the silScore/sum drift class S143 kept catching).
 *
 * INVARIANTS enforced at write time (CANON-031 — observability must not lie):
 *   1. Every silCategoriesV3 value is clamped/validated to 0..100.
 *   2. silScore := sum(silCategoriesV3) — always recomputed, never trusted.
 *   3. silMax := 1000 when categories present (SIL v3.0 rubric, CANON-009).
 *   4. lastUpdated := today (ISO date) unless explicitly suppressed.
 *
 * Usage (lib):
 *   import { enforceSilInvariant, writeProjectStatus } from './lib/write-project-status.mjs';
 *   writeProjectStatus(repoRoot, status);            // validates + writes
 *   const fixed = enforceSilInvariant(status);       // pure — returns {status, violations}
 *
 * Usage (CLI — safe to propagate to sibling repos via protocol-scripts lane):
 *   node scripts/lib/write-project-status.mjs --check          # validate only, exit 1 on violation
 *   node scripts/lib/write-project-status.mjs --fix            # rewrite in place with invariants applied
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// S156 #21: canonical list lives in lib/sil-categories.mjs (policy-drift extraction)
import { V3_CATS as CATS } from './sil-categories.mjs';
import { describeBound } from './test-signal.mjs';
// S196: SIL v6 dual-axis. Single write path — the Impact-axis invariant runs here
// too (non-breaking: fires only when silImpactCategories is present), so there is
// never a second divergent write path for the new fields.
import { enforceSilV6Invariant } from './sil-v6.mjs';
import {
  LEGACY_SESSION_FIELDS,
  STRUCTURED_SESSION_SCHEMA_VERSION,
  validateProjectStatusShape,
} from './project-status-contract.mjs';

const SESSION_NARRATIVES = ['currentFocus', 'nextMilestone', 'lastSessionSummary'];

function sessionNumber(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Build the structured session truth and compatibility view together. */
export function applySessionProjection(status, {
  durableSession,
  currentFocus,
  nextMilestone,
  lastSessionSummary,
} = {}) {
  const durable = sessionNumber(durableSession);
  if (durable == null) throw new Error('session projection requires a non-negative integer durableSession');
  const narratives = { currentFocus, nextMilestone, lastSessionSummary };
  for (const [field, value] of Object.entries(narratives)) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`session projection requires non-empty ${field}`);
  }

  const next = {
    ...status,
    schemaVersion: STRUCTURED_SESSION_SCHEMA_VERSION,
    currentSession: durable,
    lastSession: durable,
    silLastSession: durable,
    ...narratives,
    sessionState: {
      version: 1,
      durableSession: durable,
      ...narratives,
    },
  };
  for (const field of LEGACY_SESSION_FIELDS) delete next[field];
  return next;
}

// Existing readers retain the top-level view. Once adopted, every canonical
// write refreshes the nested projection before the single atomic replacement.
function refreshSessionProjection(status) {
  if (!status.sessionState && Number.parseFloat(String(status.schemaVersion ?? '0')) < Number.parseFloat(STRUCTURED_SESSION_SCHEMA_VERSION)) {
    return status;
  }
  const legacy = LEGACY_SESSION_FIELDS.filter((field) => status[field] !== undefined);
  if (legacy.length) {
    throw new Error(`PROJECT_STATUS carries forbidden legacy session field(s): ${legacy.join(', ')}; migrate explicitly with applySessionProjection`);
  }
  return applySessionProjection(status, {
    durableSession: sessionNumber(status.currentSession),
    ...Object.fromEntries(SESSION_NARRATIVES.map((field) => [field, status[field]])),
  });
}

function atomicWriteJson(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

/**
 * Pure invariant pass. Returns { status, violations } — status is a new object
 * with invariants applied; violations lists what was wrong (empty = clean).
 */
export function enforceSilInvariant(status) {
  const violations = [];
  const out = { ...status };
  const cats = out.silCategoriesV3;
  if (cats && typeof cats === 'object') {
    const fixed = {};
    for (const key of CATS) {
      let v = cats[key];
      if (typeof v !== 'number' || Number.isNaN(v)) {
        violations.push({ field: `silCategoriesV3.${key}`, value: v, fix: 'set 0 (was missing/non-numeric)' });
        v = 0;
      } else if (v < 0 || v > 100) {
        violations.push({ field: `silCategoriesV3.${key}`, value: v, fix: `clamped to ${Math.min(100, Math.max(0, v))}` });
        v = Math.min(100, Math.max(0, v));
      }
      fixed[key] = v;
    }
    // preserve any extra keys verbatim (forward-compat) but never let them
    // contribute to the score sum
    for (const [k, v] of Object.entries(cats)) if (!(k in fixed)) fixed[k] = v;
    out.silCategoriesV3 = fixed;
    const sum = CATS.reduce((s, k) => s + fixed[k], 0);
    if (out.silScore !== sum) {
      violations.push({ field: 'silScore', value: out.silScore, fix: `recomputed to ${sum} (= sum of categories)` });
      out.silScore = sum;
    }
    if (out.silMax !== 1000) {
      violations.push({ field: 'silMax', value: out.silMax, fix: 'set 1000 (SIL v3.0)' });
      out.silMax = 1000;
    }
  }
  // SIL v6 Impact-axis invariant (non-breaking — no-op unless silImpactCategories present).
  const v6 = enforceSilV6Invariant(out);
  for (const v of v6.violations) violations.push(v);

  // ── S283 [audit #2] · structured-vs-prose test deferral ────────────────────
  // testsDeferredNote and testsLastRunMode are hand-authored at closeout;
  // testsDeferred is machine-owned. When the prose says "30 files remained
  // budget-deferred and are not counted green" and the array beside it is [],
  // every consumer reads zero deferrals and renders a checkmark — the S283
  // unfalsifiable green. This is a WRITER defect, so it is reported here, at the
  // write path, and NOT auto-"fixed": the honest file list is knowable only to
  // the run that deferred them, and fabricating placeholder entries to clear a
  // violation would be exactly the invented measurement CANON-031 forbids.
  const bound = describeBound(v6.status);
  if (bound.writerDefect) {
    violations.push({
      field: 'testsDeferred',
      value: v6.status.testsDeferred,
      fix: `NOT auto-fixed — record the ${bound.claimedDeferred ?? 'deferred'} file(s) the run actually skipped (${bound.reason}). An empty array beside a deferral note makes the green unfalsifiable; never fabricate entries to clear this.`,
      unfixable: true,
    });
  }

  // ── S321 [audit #4] · the test record must not contradict itself ───────────
  // Closes [SIL][S315 #2]. The `unexplained` DETECTOR in lib/test-signal.mjs is
  // real, and it is unreachable in the case that matters: it requires a
  // CONTRADICTING GREEN HALF, so it only speaks when the assertion run is green.
  // Live at S321 both halves were red, and the record read
  //
  //     testsPassing 565 / testsTotal 566 · testsFailures []  · testsAssertionsFiles 582
  //
  // — one failure the record cannot name, and a file-level half measured over 16
  // FEWER files than the assertion half, so the two numbers printed side by side
  // came from different runs. Nothing stopped that record being WRITTEN, which is
  // where the SIL commitment says the assertion belongs.
  //
  // Neither is auto-fixed, for the S283 reason directly above: the failing file's
  // name is knowable only to the run that failed it, and a plausible placeholder
  // would be the invented measurement CANON-031 exists to forbid. An honest run
  // clears these; so does one sentence saying what the deficit is.
  for (const v of testRecordCoherenceViolations(v6.status)) violations.push(v);

  return { status: v6.status, violations };
}

/**
 * The escape hatch is a SENTENCE, not a flag: a human note naming what the deficit
 * is. That keeps the record honest under a genuinely unattributable failure (a host
 * that could not spawn a worker) without letting a boolean wave the check away.
 */
const COHERENCE_NOTE = 'testsCoherenceNote';

export function testRecordCoherenceViolations(status = {}) {
  const out = [];
  const note = typeof status[COHERENCE_NOTE] === 'string' && status[COHERENCE_NOTE].trim()
    ? status[COHERENCE_NOTE].trim() : null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const passing = num(status.testsPassing);
  const total = num(status.testsTotal);
  const files = num(status.testsAssertionsFiles);
  const named = Array.isArray(status.testsFailures) ? status.testsFailures.length : null;

  if (passing != null && total != null && named != null) {
    const deficit = total - passing;
    if (deficit > 0 && named === 0 && !note) {
      out.push({
        field: 'testsFailures',
        value: status.testsFailures,
        fix: `NOT auto-fixed — the record is short by ${deficit} file(s) and names none of them. Re-derive from ONE run (node scripts/run-tests.mjs), or set ${COHERENCE_NOTE} to the sentence that explains the deficit. Never invent a filename to clear this.`,
        unfixable: true,
      });
    }
  }

  if (files != null && total != null && files > total && !note) {
    out.push({
      field: 'testsAssertionsFiles',
      value: files,
      fix: `NOT auto-fixed — the assertion half covered ${files} files against testsTotal ${total}, so the file-level half is the narrower, OLDER run and the two numbers beside each other came from different runs. Re-derive from one run, or set ${COHERENCE_NOTE} to say which half is stale.`,
      unfixable: true,
    });
  }
  return out;
}

/**
 * Validate + write context/PROJECT_STATUS.json under the invariant.
 * Returns { written, violations }. Throws on schema-contract or I/O failure.
 */
export function writeProjectStatus(repoRoot, status, { touchLastUpdated = true } = {}) {
  const { status: invariantStatus, violations } = enforceSilInvariant(status);
  const fixed = refreshSessionProjection(invariantStatus);
  if (touchLastUpdated) fixed.lastUpdated = new Date().toISOString().slice(0, 10);
  const shape = validateProjectStatusShape(fixed, repoRoot);
  if (!shape.ok) throw new Error(`PROJECT_STATUS contract invalid:\n${shape.errors.map((error) => `  - ${error}`).join('\n')}`);
  const p = path.join(repoRoot, 'context', 'PROJECT_STATUS.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  atomicWriteJson(p, fixed);
  return { written: p, violations };
}

/** Read-modify-write helper: apply a mutator fn under the invariant. */
export function updateProjectStatus(repoRoot, mutate, opts = {}) {
  const p = path.join(repoRoot, 'context', 'PROJECT_STATUS.json');
  const current = JSON.parse(fs.readFileSync(p, 'utf8'));
  const next = mutate({ ...current }) || current;
  return writeProjectStatus(repoRoot, next, opts);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const repoRoot = (() => {
    const i = args.indexOf('--repo-root');
    return i >= 0 ? path.resolve(args[i + 1]) : process.cwd();
  })();
  const p = path.join(repoRoot, 'context', 'PROJECT_STATUS.json');
  if (!fs.existsSync(p)) { console.error(`⛔ no PROJECT_STATUS.json at ${p}`); process.exit(2); }
  const current = JSON.parse(fs.readFileSync(p, 'utf8'));
  const { status: fixed, violations } = enforceSilInvariant(current);
  const shape = validateProjectStatusShape(fixed, repoRoot);
  if (!shape.ok) {
    console.error(`⛔ PROJECT_STATUS contract invalid (${shape.errors.length}):`);
    for (const error of shape.errors) console.error(`  - ${error}`);
    process.exit(shape.schemaMissing ? 2 : 1);
  }
  // S283: some violations are deliberately NOT auto-fixable — the honest value
  // is knowable only to the run that produced it, and inventing one to clear the
  // check is the exact lie the check exists to catch. Counting those as "fixed"
  // would make --fix itself a dishonest heal, so they are reported separately and
  // still fail the exit code.
  const fixable = violations.filter(v => !v.unfixable);
  const unfixable = violations.filter(v => v.unfixable);
  if (args.includes('--fix')) {
    if (fixable.length) {
      writeProjectStatus(repoRoot, fixed, { touchLastUpdated: false });
      console.log(`✓ fixed ${fixable.length} violation(s):`);
      for (const v of fixable) console.log(`  - ${v.field}=${JSON.stringify(v.value)} → ${v.fix}`);
    } else if (!unfixable.length) {
      console.log('✓ invariant clean — no changes');
    }
    if (unfixable.length) {
      console.error(`⛔ ${unfixable.length} violation(s) --fix cannot honestly repair:`);
      for (const v of unfixable) console.error(`  - ${v.field}=${JSON.stringify(v.value)} → ${v.fix}`);
      process.exit(1);
    }
    process.exit(0);
  }
  // default: --check
  if (violations.length) {
    console.error(`⚠ ${violations.length} SIL invariant violation(s) in ${p}:`);
    for (const v of violations) console.error(`  - ${v.field}=${JSON.stringify(v.value)} → ${v.fix}`);
    process.exit(1);
  }
  console.log(`✓ SIL invariant clean (silScore=${current.silScore ?? '—'})`);
  process.exit(0);
}

export default { applySessionProjection, enforceSilInvariant, testRecordCoherenceViolations, writeProjectStatus, updateProjectStatus };
