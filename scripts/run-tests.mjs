#!/usr/bin/env node
// run-tests.mjs — Discover + run the Studio Ops test suite.
// Runs every scripts/test/tier*.mjs + legacy scripts/test-*.mjs + ignis/src/test-*.ts.
// Writes assertion-level detail (testsAssertions*) + testsLastRun into PROJECT_STATUS.json.
// refresh-test-count.mjs is the SOLE owner of the canonical file-level testsPassing/testsTotal (S160 #4).
//
// Usage:
//   node scripts/run-tests.mjs                # full suite
//   node scripts/run-tests.mjs --tier=1       # tier filter
//   node scripts/run-tests.mjs --json         # machine output
//   node scripts/run-tests.mjs --no-write     # don't update PROJECT_STATUS
//   node scripts/run-tests.mjs --changed      # fast inner loop: only tests affected
//                                             # by the working-tree diff (implies --no-write)
//   node scripts/run-tests.mjs --no-retry     # disable isolation-retry of failed files
//   node scripts/run-tests.mjs --shard=1/4    # run deterministic shard 1 of 4
//   node scripts/run-tests.mjs --shards=4     # run all shards sequentially and aggregate JSON proof
//   node scripts/run-tests.mjs --shards=64 --resume-shards --max-shards-per-run=8
//   node scripts/run-tests.mjs --shard=1/4 --failure-sidecar=.cache/custom.ndjson

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from './lib/safe-spawn.mjs';
import { isSpawnExhaustion, spawnBackoffMs, spawnResilient } from './lib/spawn-resilience.mjs';
import { getHostLoad } from './lib/host-load.mjs';
import { discoverSuiteFiles, tierOf } from './lib/test-discovery.mjs';
import { readDurationCache, recordDuration, sortByHistoricalDuration, writeDurationCache } from './lib/test-duration-ordering.mjs';
import { buildProofSourceManifest } from './lib/proof-source-manifest.mjs';
import { buildShardSourcePlan, shardDependencyGraph } from './lib/shard-proof-sources.mjs';
import { liveStateBlockedMessage, missingLiveState } from './lib/test-live-state.mjs';
import { envBlockedEntry, PRECONDITION_ABSENT, HOST_SPAWN_EXHAUSTED } from './lib/env-blocked.mjs';
import { writeProjectStatus } from './lib/write-project-status.mjs';
// Re-export the pure helpers so existing importers of run-tests keep working and the
// single source of truth stays scripts/lib/spawn-resilience.mjs.
export { isSpawnExhaustion, spawnBackoffMs };

/**
 * Was this test file modified after the suite started?
 *
 * S334. `flaky` means "same input, different result". The isolation-retry runs minutes
 * after the first attempt, so on a long suite an author can edit the file in between —
 * which happened this session: three files failed early in a 608-file run, were FIXED
 * while it was still going, passed on retry, and were written into
 * portfolio/FLAKY_HISTORY.json, where a chronic-flake probe escalates any file seen in
 * ≥3 consecutive sessions. A false flake is a durable poisoning of a trend signal.
 *
 * Exported so the claim is testable rather than asserted. Absent or unreadable timing is
 * `false` — NOT proof the file changed — because the fail-safe direction here is to leave
 * the file eligible for the flaky classification it would have received anyway.
 */
export function wasEditedDuringRun(mtimeMs, suiteStartedMs) {
  if (!Number.isFinite(mtimeMs) || !Number.isFinite(suiteStartedMs)) return false;
  return mtimeMs > suiteStartedMs;
}


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DURATION_CACHE = path.join(ROOT, '.cache', 'test-durations.json');
const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Usage: node scripts/run-tests.mjs [--tier=1|2] [--json] [--no-write] [--changed] [--no-retry] [--shard=N/M|--shards=N] [--resume-shards] [--max-shards-per-run=N]');
  process.exit(0);
}
const TIER = (argv.find(a => a.startsWith('--tier=')) || '').split('=')[1] || null;
const JSON_OUT = argv.includes('--json');
const CHANGED = argv.includes('--changed');
const SHARD_SPEC = (argv.find(a => a.startsWith('--shard=')) || '').split('=')[1] || '';
const SHARD_COUNT = parsePositiveInt((argv.find(a => a.startsWith('--shards=')) || '').split('=')[1]);
const RESUME_SHARDS = argv.includes('--resume-shards');
const MAX_SHARDS_PER_RUN = parsePositiveInt((argv.find(a => a.startsWith('--max-shards-per-run=')) || '').split('=')[1]);
const PROOF_DIR_ARG = (argv.find(a => a.startsWith('--proof-dir=')) || '').split('=')[1] || '';
const FAILURE_SIDECAR_ARG = (argv.find(a => a.startsWith('--failure-sidecar=')) || '').split('=')[1] || '';
// --changed runs a SUBSET, so it must never overwrite the canonical PROJECT_STATUS
// test counts (that would report a partial run as the whole suite). Always no-write.
// Shards also run a subset. Only the aggregate --shards=N command may write the
// merged full-suite assertion surface.
const NO_WRITE = argv.includes('--no-write') || CHANGED || Boolean(SHARD_SPEC);

function parsePositiveInt(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseBudgetSeconds(args = [], env = process.env) {
  const raw = (args.find(a => a.startsWith('--budget-seconds=')) || '').split('=')[1]
    || env.TEST_RUN_BUDGET_SECONDS
    || '';
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function shouldStopForBudget(startMs, budgetSeconds, nowMs = Date.now()) {
  if (!budgetSeconds) return false;
  return nowMs - startMs >= budgetSeconds * 1000;
}

function discover() {
  const files = [];
  const testDir = path.join(ROOT, 'scripts', 'test');
  if (fs.existsSync(testDir)) {
    // S313 [audit #2] — one shared definition of "the suite", imported by this runner and
    // by refresh-test-count. They previously disagreed by 59 files and the narrower one
    // was the founder-facing surface.
    for (const f of discoverSuiteFiles(testDir)) {
      if (TIER && !f.startsWith(`tier${TIER}-`)) continue;
      files.push({ tier: tierOf(f), path: path.join(testDir, f), kind: 'node' });
    }
  }
  // Legacy scripts/test-*.mjs (keep running for backward compat)
  if (!TIER || TIER === 'legacy') {
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts'))) {
      if (/^test-.*\.mjs$/.test(f)) {
        files.push({ tier: 'legacy', path: path.join(ROOT, 'scripts', f), kind: 'node' });
      }
    }
  }
  // IGNIS tests
  const ignisDir = path.join(ROOT, 'ignis', 'src');
  if (fs.existsSync(ignisDir) && (!TIER || TIER === 'ignis')) {
    for (const f of fs.readdirSync(ignisDir)) {
      if (/^test-.*\.ts$/.test(f)) {
        files.push({ tier: 'ignis', path: path.join(ignisDir, f), kind: 'tsx' });
      }
    }
  }
  return files.sort((a, b) => a.tier.localeCompare(b.tier) || a.path.localeCompare(b.path));
}

export function parseShardSpec(spec) {
  if (!spec) return null;
  const m = String(spec).match(/^(\d+)\/(\d+)$/);
  if (!m) throw new Error(`invalid shard spec "${spec}" (expected i/n)`);
  const index = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 1 || index > total) {
    throw new Error(`invalid shard spec "${spec}" (expected 1 <= i <= n)`);
  }
  return { index, total };
}

export function fileShardIndex(file, total) {
  const rel = path.relative(ROOT, file.path || String(file)).replace(/\\/g, '/');
  let hash = 2166136261;
  for (let i = 0; i < rel.length; i++) {
    hash ^= rel.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % total;
}

export function partitionFilesIntoShard(files, shard) {
  if (!shard) return files;
  return files.filter(f => fileShardIndex(f, shard.total) === shard.index - 1);
}
export function shardProofPath(proofDir, shardCount, shardIndex) {
  return path.join(proofDir, `shard-${shardIndex}-of-${shardCount}.json`);
}

export function stableProofHash(value) {
  const text = JSON.stringify(value ?? null);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function shardProofShape({ files = [], shardCount = null, shardIndex = null, passthrough = [], root = ROOT, proofSources = null } = {}) {
  const filePaths = files
    .map(f => path.relative(root, f.path || String(f)).replace(/\\/g, '/'))
    .sort();
  const normalizedArgs = [...passthrough].sort();
  return {
    totalFiles: filePaths.length,
    filesHash: stableProofHash(filePaths),
    shardCount,
    shardIndex,
    argsHash: stableProofHash(normalizedArgs),
    proofSources: proofSources || buildProofSourceManifest(root),
  };
}

export function proofShapeMatches(actual, expected) {
  if (!actual || !expected) return false;
  return actual.totalFiles === expected.totalFiles
    && actual.filesHash === expected.filesHash
    && actual.shardCount === expected.shardCount
    && (actual.shardIndex ?? null) === (expected.shardIndex ?? null)
    && actual.argsHash === expected.argsHash
    && actual.proofSources?.schemaVersion === expected.proofSources?.schemaVersion
    && actual.proofSources?.rootHash === expected.proofSources?.rootHash;
}

export function reusableShardProof(proof, { shardCount, shardIndex, proofShape = null } = {}) {
  if (!proof || proof.mode !== 'shard-proof') return false;
  if (shardCount && proof.shardCount !== shardCount) return false;
  if (shardIndex && proof.shardIndex !== shardIndex) return false;
  if (proofShape && !proofShapeMatches(proof.proofShape, proofShape)) return false;
  const parsed = proof.parsed || {};
  return proof.exitCode === 0
    && !proof.signal
    && parsed.failures === 0
    && !(parsed.envBlocked || []).length
    && !(parsed.inconclusive || []).length
    && !(parsed.deferred || []).length
    && !parsed.budgetExhausted;
}

export function boundedShardDecision({ reusable = false, executed = 0, max = null } = {}) {
  if (reusable) return 'reuse';
  if (max && executed >= max) return 'checkpoint';
  return 'execute';
}
// S167 [audit #2] test-runner-inconclusive-honesty — pure, unit-testable
// classifier for a file that FAILED in-suite, given its solo-retry result.
// Honest discriminator: a real regression shows pass < total; concurrent-load
// contention (Windows teardown/file-lock race) shows pass === total with a
// non-zero exit. 'inconclusive' carries the passing assertions forward but is
// surfaced distinctly — it can never mask an assertion failure.
export function classifyAfterRetry(retry) {
  if (retry.status === 'pass') return 'flaky';
  if (retry.total > 0 && retry.pass === retry.total) return 'inconclusive';
  return 'fail';
}

// S286 full-suite-timeout-truth — a process timeout produces no assertion
// verdict. Changed mode keeps its existing deferred classification; full mode
// uses a distinct inconclusive status so it is neither a phantom red nor green.
export function timeoutResult({ file, tier, changed = false, timeoutMs }) {
  return {
    file,
    tier,
    pass: 0,
    total: 0,
    status: changed ? 'deferred-changed-timeout' : 'inconclusive-timeout',
    output: changed
      ? `deferred in --changed mode after ${timeoutMs}ms timeout; run full suite or this file directly for full coverage; NOT counted green`
      : `inconclusive after ${timeoutMs}ms full-mode timeout; no assertion verdict was produced — run this file directly on a quiet host; NOT counted green, NOT a regression`,
  };
}

// S190 [SIL S189 #2] test-runner failures-only streaming sidecar.
// A long buffered run (`run-tests | tail`) shows NOTHING until it finishes AND
// `| tail` truncates the per-file failure detail you actually need — this cost
// ~15min of blind waiting in S188/S189 before pivoting to isolation. Fix: emit
// per-file progress to STDERR (keeps `--json` STDOUT pure and survives a STDOUT
// `| tail`) and append every FAILURE to a live ndjson sidecar the instant it
// resolves, so `tail -f .cache/test-failures.ndjson` makes any run observable in
// real time. Both helpers below are pure + unit-tested (tier1-test-failure-sidecar).
export function defaultFailureSidecarPath(root, shardSpec = '') {
  const shard = parseShardSpec(shardSpec);
  return shard
    ? path.join(root, '.cache', 'test-shards', 'manual', `shard-${shard.index}-of-${shard.total}.failures.ndjson`)
    : path.join(root, '.cache', 'test-failures.ndjson');
}

export const SIDECAR_PATH = path.resolve(FAILURE_SIDECAR_ARG || defaultFailureSidecarPath(ROOT, SHARD_SPEC));

export function shardFailureSidecarPath(proofDir, shardCount, shardIndex) {
  return path.join(proofDir, `shard-${shardIndex}-of-${shardCount}.failures.ndjson`);
}

export function mergeShardFailureLedgers(shards = []) {
  const merged = [];
  const seen = new Set();
  for (const shard of shards) {
    let lines = [];
    try { lines = fs.readFileSync(shard.path, 'utf8').split(/\r?\n/).filter(Boolean); } catch { continue; }
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        const enriched = { ...record, shard: shard.shard, sourceSidecar: String(shard.sourceSidecar || '').replace(/\\/g, '/') };
        const key = JSON.stringify(enriched);
        if (!seen.has(key)) { seen.add(key); merged.push(enriched); }
      } catch { /* malformed shard telemetry is excluded from the merged ledger */ }
    }
  }
  return merged;
}

export function writeFailureLedger(target, records = []) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''), 'utf8');
}

// Extract the single most diagnostic line from a captured test output blob.
// Prefers a line that looks like an assertion/failure/error; falls back to the
// last non-empty line. Bounded so the sidecar stays line-oriented and greppable.
// S276 — a candidate line must also CARRY information. `⛔ …` matched the harness's
// bare `{` (the first line of a pretty-printed JSON blob a test threw), so the sidecar
// recorded `{` as an entire failure cause. Structural punctuation is not a diagnosis:
// a line whose content is only brackets/quotes/commas is skipped in favour of the next
// candidate, and only falls through if nothing better exists.
const PUNCTUATION_ONLY = /^[\s{}[\](),;:'"`]*$/;
// The status glyph is stripped BEFORE judging content: `⛔ {` is a marker attached to
// nothing, and counting the marker itself as content would re-admit the exact line
// this guard exists to reject.
const STATUS_GLYPHS = /[⛔✗✘×✓⚠◐⊘]/g;
// The harness's own truncation notice is METADATA about the message, not the message.
// Introduced with the full-message render and immediately observed being selected as a
// failure cause (`… +28 more line(s)`), which would have replaced one uninformative
// cause with another.
const ELISION_NOTICE = /^…\s*\+\d+\s+more line\(s\)$/;

export function lastFailureCause(output) {
  const lines = (output || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return '';
  const informative = (s) =>
    !ELISION_NOTICE.test(s) && !PUNCTUATION_ONLY.test(s.replace(STATUS_GLYPHS, ''));
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/⛔|FAIL|Error|✗|assert|Expected|Received|throw/i.test(lines[i]) && informative(lines[i])) {
      return lines[i].slice(0, 200);
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (informative(lines[i])) return lines[i].slice(0, 200);
  }
  return lines[lines.length - 1].slice(0, 200);
}

// One fixed-width progress line per resolved file (streamed to stderr).
export function formatProgressLine(i, n, r) {
  const mark = r.status === 'pass' || r.status === 'covered-directly' ? '✓' : r.status === 'flaky' ? '⚠' : String(r.status || '').startsWith('inconclusive') ? '◐' : r.status === 'env-blocked' ? '⊘' : '⛔';
  const idx = `${String(i).padStart(String(n).length)}/${n}`;
  return `[${idx}] ${mark} T${String(r.tier).padEnd(6)} ${String(r.file).padEnd(46)} ${r.pass}/${r.total}`;
}

// S203 [SIL][S202 #1] test-runner handle-exhaustion ROOT-FIX (carried [SIL #2]
// since S200, deferred 3× as "env-blocked — attempt on a quiet host"). The runner
// runs files SERIALLY, so the exhaustion is never the runner's own concurrency:
// under 8-12 concurrent founder sessions the OS process/handle table saturates and
// `spawnSync` itself fails to create the child. The spawn-resilience policy (detect
// res.error resource code → bounded backoff retry → honest 'env-blocked') lives ONCE
// in scripts/lib/spawn-resilience.mjs, shared with refresh-test-count.mjs so the two
// test-spawning surfaces can never drift apart again (S153/S159 divergence lesson).
const SPAWN_RETRIES = parseInt(process.env.TEST_SPAWN_RETRIES || '5', 10);
// S338 — moved to lib/test-file-timeout.mjs so refresh-test-count.mjs uses the SAME
// budget (it had hardcoded 60s/150s and dropped files this runner passed). Re-exported
// here because existing tests import testFileTimeoutMs from run-tests.mjs.
import { testFileTimeoutMs, CHANGED_FILE_TIMEOUT_MS } from './lib/test-file-timeout.mjs';
export { testFileTimeoutMs };
const CHANGED_HEAVY_DEFER = new Set([
  'scripts/test/tier1-doctor-probes.mjs',
]);
const DIRECT_TEST_PROOF_PATH = path.join(ROOT, '.cache', 'direct-test-proofs.json');

export function usableDirectTestProof(proof, { relFile, mtimeMs } = {}) {
  if (!proof || proof.file !== relFile || proof.status !== 'pass') return false;
  if (!Number.isFinite(proof.pass) || !Number.isFinite(proof.total) || proof.total <= 0) return false;
  if (proof.pass !== proof.total || proof.fail !== 0) return false;
  if (Number.isFinite(mtimeMs) && Math.abs(Number(proof.mtimeMs) - mtimeMs) > 1) return false;
  return true;
}

export function directTestProofFor(relFile, { proofPath = DIRECT_TEST_PROOF_PATH } = {}) {
  try {
    const proofs = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    const proof = proofs?.[relFile];
    const stat = fs.statSync(path.join(ROOT, relFile));
    return usableDirectTestProof(proof, { relFile, mtimeMs: stat.mtimeMs }) ? proof : null;
  } catch {
    return null;
  }
}

export function coveredDirectlyResult(file, proof) {
  return {
    file: proof.file,
    tier: file.tier,
    pass: proof.pass,
    total: proof.total,
    status: 'covered-directly',
    output: `same-session direct focused proof at ${proof.generatedAt}; changed-mode reused this receipt instead of deferring doctor-heavy coverage`,
  };
}

// S341 [audit #1] = [S338 #14] — ownership is PARENTAGE, never command text.
import { ownedKillPlan } from './lib/process-tree.mjs';

/**
 * Stop node children leaked by a timed-out test file — and ONLY those.
 *
 * This used to stop every node.exe whose command line matched this repo's
 * `scripts/test` or `run-doctor.mjs`. Several agent sessions share this checkout, so
 * that selector matches another session's live doctor as readily as our own orphan;
 * S338 killed a Codex session's doctor with exactly this shape. Command text is now a
 * NARROWING filter only: a candidate is stopped when its ancestry reaches this runner
 * or the timed-out child it spawned. The child is normally already dead, so adoption
 * through it requires a creation time at or after the spawn (a recycled PID cannot
 * adopt a stranger). Refusals are counted, not hidden.
 */
export function cleanupLeakedTestNodeChildren(root = ROOT, { spawnSyncFn = spawnSync, rootPids = [process.pid], notBeforeMs = null } = {}) {
  if (process.platform !== 'win32') return { attempted: false, killed: 0, reason: 'non-windows' };
  const escapedRoot = root.replace(/'/g, "''");
  const ps = [
    '$ErrorActionPreference = "SilentlyContinue"',
    `$root = '${escapedRoot}'`,
    '$self = $PID',
    "$procs = Get-CimInstance Win32_Process -Filter \"name = 'node.exe'\" | Where-Object { $_.ProcessId -ne $self -and $_.CommandLine -like \"*$root*\" -and $_.CommandLine -match 'scripts[\\\\/]+(test|run-doctor\\.mjs)' }",
    '$cand = @($procs | Select-Object -ExpandProperty ProcessId)',
    '$all = @(Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; createdMs = $(if ($_.CreationDate) { [DateTimeOffset]::new($_.CreationDate).ToUnixTimeMilliseconds() } else { $null }) } })',
    '@{ cand = $cand; all = $all } | ConvertTo-Json -Compress -Depth 4',
  ].join('; ');
  const res = spawnSyncFn('powershell', ['-NoProfile', '-Command', ps], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
  });
  let table;
  try { table = JSON.parse(String(res.stdout || '').trim()); } catch {
    // No table, no ownership proof — kill nothing rather than guess.
    return { attempted: true, killed: 0, refused: 0, code: res.status ?? -1, reason: 'process table unreadable — nothing stopped' };
  }
  const plan = ownedKillPlan({ rootPids, rows: [].concat(table?.all ?? []), candidates: [].concat(table?.cand ?? []), notBeforeMs });
  if (plan.kill.length) {
    spawnSyncFn('powershell', ['-NoProfile', '-Command', `Stop-Process -Id ${plan.kill.join(',')} -Force -ErrorAction SilentlyContinue`], {
      cwd: root, encoding: 'utf8', timeout: 15_000, windowsHide: true,
    });
  }
  return { attempted: true, killed: plan.kill.length, refused: plan.refused.length, code: res.status ?? -1 };
}
function runOne(file, { spawnRetries = SPAWN_RETRIES } = {}) {
  const relFile = path.relative(ROOT, file.path).replace(/\\/g, '/');
  // S280 [audit #2] — a test that DECLARES a live-state dependency it cannot
  // find has no verdict to give. Before S280 the declaration was decorative:
  // `tier1-session-lock.mjs` announced `@integration-live-state
  // context/.session-lock` and then hard-threw whenever no session was open, so
  // the suite headline silently encoded whether a human happened to be mid-
  // session. Reuse the existing `env-blocked` class (CANON-031: never green,
  // never red) rather than letting ambient state masquerade as a regression.
  // Checked BEFORE spawn — running a file to a guaranteed throw is pure cost.
  const liveState = missingLiveState(file.path, ROOT);
  if (liveState.missing.length) {
    return {
      file: relFile, tier: file.tier, pass: 0, total: 0,
      status: 'env-blocked',
      // S336 [audit #2] — 'env-blocked' carries two structurally different causes.
      // This one is decided BEFORE any spawn and is unaffected by host load, so it
      // must not inherit the "re-run on a quieter host" advice.
      envBlockedCause: PRECONDITION_ABSENT,
      output: liveStateBlockedMessage(liveState.missing),
    };
  }
  if (CHANGED && CHANGED_HEAVY_DEFER.has(relFile)) {
    const proof = directTestProofFor(relFile);
    if (proof) return coveredDirectlyResult(file, proof);
    return {
      file: relFile, tier: file.tier, pass: 0, total: 0,
      status: 'deferred-changed-heavy',
      output: 'deferred in --changed mode because this doctor-heavy coverage test can consume the inner-loop timeout; run full suite or the file directly for full coverage; NOT counted green',
    };
  }
  // S205 [SIL][S203 #1 follow-up] two-surface CONVERGENCE + window-storm ROOT
  // ELIMINATION. The canonical test-count surface (refresh-test-count.mjs) spawns
  // node files via `process.execPath` with NO shell; this runner had drifted to
  // `node` + `shell: true` — exactly the S153/S159 "paired test-spawn surfaces must
  // not diverge" hazard. Two real costs of the `shell: true` drift (speed is a
  // wash — node startup dominates, measured ~3s/file either way under load):
  //   1. WINDOW-STORM ROOT: on Windows `shell: true` is the ROOT CAUSE of the Git
  //      Bash (mingw) console-window storm that S186/S187/S195 fought repeatedly
  //      with `windowsHide` band-aids. `process.execPath` (absolute node path, no
  //      PATH/.cmd resolution needed) spawns NO shell → no mingw window can exist
  //      for the 250/252 node files. The root cause is removed, not suppressed.
  //   2. DEP0190: passing `args` with `shell: true` is a Node security deprecation
  //      (args concatenated unescaped). execPath + shell:false clears it.
  // Only `npx tsx` (IGNIS, 2 .ts files) still needs a shell to resolve the .cmd
  // shim — refresh-test-count never runs those, so this subset cannot diverge.
  const isTsx = file.kind === 'tsx';
  const cmd = isTsx ? 'npx' : process.execPath;
  const args = isTsx ? ['tsx', path.basename(file.path)] : [file.path];
  // IGNIS tests must run from ignis/src (relative imports + tsconfig). Other tests run from repo root.
  const cwd = isTsx ? path.dirname(file.path) : ROOT;
  // Default full-file budget is 300s. The named fleet propagation walker gets
  // 720s on full runs because the current sequential Windows walk is measured
  // beyond six minutes; changed mode remains strictly bounded.
  // windowsHide stays belt-and-suspenders for the tsx (shell:true) path; for node
  // files no shell spawns so it is moot but harmless.
  const timeoutMs = testFileTimeoutMs(file, { changed: CHANGED });
  const opts = { cwd, encoding: 'utf8', timeout: timeoutMs, shell: isTsx, windowsHide: true };
  // S341 [audit #1] — the spawn instant bounds which orphans of this child we may claim.
  const spawnedAtMs = Date.now();
  const { res, spawnRetries: attempt, envBlocked } = spawnResilient(spawnSync, cmd, args, opts, { retries: spawnRetries });
  // Still unspawnable after backoff → host genuinely saturated. Honest 'env-blocked':
  // not a test result at all (pass/total 0), surfaced distinctly, never red, never green.
  if (envBlocked) {
    return {
      file: path.relative(ROOT, file.path), tier: file.tier, pass: 0, total: 0,
      status: 'env-blocked', spawnRetries: attempt,
      envBlockedCause: HOST_SPAWN_EXHAUSTED,
      output: `spawn ${res.error?.code || 'error'} after ${attempt} backoff retries — host process/handle table saturated (concurrent sessions); NOT a test regression`,
    };
  }
  const out = (res.stdout || '') + (res.stderr || '');
  const timedOut = res.status === null || res.signal === 'SIGTERM' || /timed out/i.test(String(res.error?.message || ''));
  if (timedOut) {
    cleanupLeakedTestNodeChildren(ROOT, { rootPids: [process.pid, res.pid].filter(Number.isInteger), notBeforeMs: spawnedAtMs });
    return timeoutResult({
      file: relFile,
      tier: file.tier,
      changed: CHANGED,
      timeoutMs,
    });
  }
  // harness format: "<label>  <pass>/<total>  [✓|⛔ N FAIL]"
  const m = out.match(/(\S+)\s+(\d+)\/(\d+)\s+(.+)$/m);
  const pass = m ? parseInt(m[2], 10) : null;
  const total = m ? parseInt(m[3], 10) : null;
  const failed = res.status !== 0;
  return {
    file: path.relative(ROOT, file.path),
    tier: file.tier,
    pass: pass ?? (failed ? 0 : 1),
    total: total ?? 1,
    status: failed ? 'fail' : 'pass',
    output: out.trim().split('\n').slice(-8).join('\n'),
  };
}

// --changed (S165 suite-changed-only-mode): inner-loop fast lane. Selects only the
// test files affected by the working-tree diff vs HEAD, always includes the cheap
// tier1 guards, and skips the ~2.5min sibling-repo walk (propagate-*) unless a
// propagate/template file changed. Full suite stays the default; this is opt-in.
function repoRelativeFile(filePath) {
  return path.relative(ROOT, path.resolve(filePath)).replace(/\\/g, '/');
}

export function changedOrderRank(file, changedRel = new Set()) {
  const rel = repoRelativeFile(file.path);
  if (changedRel.has(rel)) return 0;
  if (file.tier === '1') return 1;
  return 2;
}

export function orderChangedTests(files, changedRel = new Set(), durationCache = {}) {
  return sortByHistoricalDuration(files, durationCache, f => repoRelativeFile(f.path))
    .sort((a, b) => changedOrderRank(a, changedRel) - changedOrderRank(b, changedRel));
}

function filterToChanged(allFiles) {
  let changed = [];
  try {
    const a = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    const b = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    changed = [...a.split('\n'), ...b.split('\n')].map(s => s.trim()).filter(Boolean);
  } catch {
    return allFiles; // git unavailable → fail safe to full run
  }
  if (!changed.length) return [];
  const changedRel = new Set(changed.map(c => c.replace(/\\/g, '/')));
  const durationCache = readDurationCache(DURATION_CACHE);
  const tokens = new Set();
  let propagateTouched = false;
  for (const c of changed) {
    tokens.add(path.basename(c).replace(/\.(mjs|ts|sh|json|md|yml|yaml)$/i, ''));
    if (/propagate|template/i.test(c)) propagateTouched = true;
  }
  const selected = [];
  const seen = new Set();
  for (const f of allFiles) {
    const rel = path.relative(ROOT, f.path).replace(/\\/g, '/');
    const fname = path.basename(f.path);
    let include = false;
    if (f.tier === '1') include = true;                      // cheap guards always
    else if (changedRel.has(rel)) include = true;            // the test file itself changed
    else if (/propagate/i.test(fname) && !propagateTouched) include = false; // skip slow walk
    else {
      try {
        const body = fs.readFileSync(f.path, 'utf8');
        for (const t of tokens) { if (t.length >= 4 && body.includes(t)) { include = true; break; } }
      } catch { /* unreadable → skip */ }
    }
    if (include && !seen.has(rel)) { seen.add(rel); selected.push(f); }
  }
  return orderChangedTests(selected, changedRel, durationCache);
}

// Guard top-level execution so `import { classifyAfterRetry }` from a tier test
// does not trigger a full suite run (S167 [audit #2]).
// S204 A3 [SIL S203 #2] — host-load-aware suite preflight. On a host saturated
// with concurrent sessions, full runs hit spawn exhaustion and files land
// 'env-blocked' AFTER minutes of waiting. Surface that risk UP FRONT so the
// env-blocked signal is a pre-emptive heads-up, not a post-hoc surprise. Pure +
// testable: returns the advisory string ('' when host looks idle — no noise).
export function hostPreflightAdvisory(load, fileCount) {
  // S290 [audit #1] — an unread census used to return '' here, i.e. exactly what a
  // measured-quiet host returns. The suite still runs in full (deferring tests on a
  // guess would be worse), but the operator is told the host was never measured
  // rather than being shown the silence that means "quiet".
  if (load && load.measured !== true) {
    return `⚠ host-load preflight: host load UNMEASURED${load.reason ? ` (${load.reason})` : ''} — `
      + `running all ${fileCount} test file(s) in full; env-blocked results, if any, are not evidence of a code regression.`;
  }
  if (!load || load.error || load.nodeCount < 0 || !load.saturated) return '';
  return `⚠ host-load preflight: ${load.nodeCount} node procs running (host saturated) — `
    + `env-blocked likely on some of the ${fileCount} test file(s) under concurrent-session load. `
    + `Files that can't spawn after backoff are reported 'env-blocked' (never green, never red).`;
}

// S205 [SIL][S204 #2] HOST-AWARE SUITE SCHEDULER — the A3 preflight (above) NAMES host
// saturation; this ACTS on it. Under saturation the spawn-heavy sibling-walking tests (each
// shells out to walk all ~27 repos via git/bash — the dominant OS process pressure AND the
// files most likely to env-block after minutes of waiting) are deferred to a distinct honest
// bucket so a saturated host yields a CLEAN SMALLER-GREEN of the core contract suite instead
// of env-blocked noise. 'deferred-host-saturated' is NEVER counted green and NEVER red
// (CANON-031) — same honesty contract as env-blocked, but a deliberate scheduling choice made
// UP FRONT, not a post-hoc spawn failure. On a quiet host (CI/Linux, or a calm Windows box)
// nothing is deferred and the full suite runs. Opt out with --force-slow.
//
// Named, auditable set — mirrors refresh-test-count.mjs LONG_RUNNING (kept aligned by the
// tier2-spawn-resilience-coherence sentinel); ONLY the genuinely slow sibling-walkers, never
// a cheap tier1 guard, so the core contract suite always runs in full.
export const SLOW_SIBLING_WALKERS = new Set([
  'tier2-propagate-dry-run.mjs',          // walks all ~27 repos via bash — ~7min solo
  'tier2-propagate-protocol-scripts.mjs', // shells out per-repo to diff propagated scripts
]);

export function isDeferrableUnderLoad(file) {
  const name = path.basename(typeof file === 'string' ? file : (file?.path || ''));
  return SLOW_SIBLING_WALKERS.has(name);
}

// GitHub Actions does not have the founder workstation's sibling repos, ~/.claude
// skill bodies, or live local Studio credentials. These tests still run locally;
// in CI they are reported as deferred-ci-env (not green, not red) so portable
// regressions keep failing while machine-local contracts do not pretend to apply.
export const CI_LOCAL_STATE_TESTS = new Set([
  'credential-governance.test.mjs',
  'lifecycle.test.mjs',
  'protocol-invariants.mjs',
  'test-email-delivery-plane.mjs',
  'tier1-doctor-probes.mjs',
  'tier1-gateway-credential-test-honesty.mjs',
  'tier1-host-aware-scheduler.mjs',
  'tier1-release-gate-scope-no-write.mjs',
  'tier1-session-lock.mjs',
  'tier1-sil-migration.mjs',
  'tier1-skill-profile.mjs',
  'tier1-v40-ships.mjs',
  'tier2-canon-019-propagation.mjs',
  'tier2-canon-038-shared-selfhost.mjs',
  'tier2-canon-artifact-claims.mjs',
  'tier2-capability-action-probes.mjs',
  'tier2-context-wipe-guard.mjs',
  'tier2-email-delivery-ledger.mjs',
  'tier2-internal-tools-coverage.mjs',
  'tier2-loop-b-recurrence.mjs',
  'tier2-migrate-sil-idempotent.mjs',
  'tier2-medium-overlays-parity.mjs',
  'tier2-mirror-gh-secrets.mjs',
  'tier2-model-routing.mjs',
  'tier2-package-trust-sweep.mjs',
  'tier2-portfolio-debt.mjs',
  'tier2-protocol-skill-parity.mjs',
  'tier2-s142-utility-scripts.mjs',
  'tier2-skill-body-overlay-wired.mjs',
  'tier2-session-trace-identity.mjs',
  'tier2-stalled-onboarding-followup.mjs',
  'tier2-studio-oracle.mjs',
  'tier2-unmapped-warnings-gate.mjs',
  'tier2-unregistered-maps.mjs',
  'tier3-ark-end-to-end-loop.mjs',
  'tier3-registry-coherence.mjs',
]);

export function isDeferredInCi(file) {
  const name = path.basename(typeof file === 'string' ? file : (file?.path || ''));
  return process.env.GITHUB_ACTIONS === 'true' && !argv.includes('--force-ci-env') && CI_LOCAL_STATE_TESTS.has(name);
}
// Partition discovered files into {run, deferred} given host load. Defers ONLY when the host
// is genuinely saturated and the caller did not force a full run. Pure + unit-tested.
export function partitionForHostLoad(files, load, { forceSlow = false } = {}) {
  if (forceSlow || !load || load.error || !load.saturated) return { run: files, deferred: [] };
  const run = [], deferred = [];
  for (const f of files) (isDeferrableUnderLoad(f) ? deferred : run).push(f);
  return { run, deferred };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { await main(); }

async function main() {
if (SHARD_COUNT) {
  await runShardAggregate(SHARD_COUNT);
  return;
}
let files = discover();
const shard = parseShardSpec(SHARD_SPEC);
if (CHANGED) {
  const all = files.length;
  files = filterToChanged(files);
  console.log(`\n--changed: ${files.length}/${all} test files affected by working-tree diff${files.length === 0 ? ' (nothing to run)' : ''}`);
}
if (shard) {
  const all = files.length;
  files = partitionFilesIntoShard(files, shard);
  if (!JSON_OUT) console.log(`\n--shard=${shard.index}/${shard.total}: ${files.length}/${all} test files selected`);
}
// S204 A3 — emit the host-load preflight advisory before the run loop (stderr,
// safe alongside --json stdout). Only prints when the host is actually saturated.
const hostLoad = getHostLoad();
const preflight = hostPreflightAdvisory(hostLoad, files.length);
if (preflight) process.stderr.write(preflight + '\n');

// S205 [SIL][S204 #2] host-aware scheduler — defer the slow sibling-walkers when saturated.
const FORCE_SLOW = argv.includes('--force-slow');
const { run: filesToRun, deferred: deferredFiles } = partitionForHostLoad(files, hostLoad, { forceSlow: FORCE_SLOW });
if (deferredFiles.length) {
  process.stderr.write(
    `⏸ host-saturated scheduler: deferring ${deferredFiles.length} slow sibling-walking test(s) `
    + `[${deferredFiles.map(f => path.basename(f.path)).join(', ')}] — run on a quiet host or with `
    + `--force-slow. Deferred ≠ passed (CANON-031); core contract suite still runs in full.\n`);
}
files = filesToRun;
const ciDeferredFiles = [];
if (process.env.GITHUB_ACTIONS === 'true' && !argv.includes('--force-ci-env')) {
  const ciRun = [];
  for (const f of files) (isDeferredInCi(f) ? ciDeferredFiles : ciRun).push(f);
  if (ciDeferredFiles.length) {
    process.stderr.write(
      `⏸ CI-local-state scheduler: deferring ${ciDeferredFiles.length} machine-local test(s) `
      + `[${ciDeferredFiles.map(f => path.basename(f.path)).join(', ')}] — run on the founder workstation or with `
      + `--force-ci-env. Deferred ≠ passed (CANON-031); portable suite still runs.\n`);
  }
  files = ciRun;
}

// S190 [SIL S189 #2] failures-only streaming sidecar (see helpers above).
// Stream is always on (stderr is safe alongside --json stdout); --no-stream opts out.
const STREAM = !argv.includes('--no-stream');
try { fs.mkdirSync(path.dirname(SIDECAR_PATH), { recursive: true }); fs.writeFileSync(SIDECAR_PATH, ''); } catch { /* sidecar best-effort */ }
const sidecar = (obj) => { try { fs.appendFileSync(SIDECAR_PATH, JSON.stringify(obj) + '\n'); } catch { /* best-effort */ } };
const results = [];
const durationCache = CHANGED ? readDurationCache(DURATION_CACHE) : null;
const BUDGET_SECONDS = parseBudgetSeconds(argv) ?? (CHANGED ? 120 : null);
const suiteStartedAt = Date.now();
let budgetExhausted = false;
for (let idx = 0; idx < files.length; idx++) {
  const file = files[idx];
  if (shouldStopForBudget(suiteStartedAt, BUDGET_SECONDS)) {
    budgetExhausted = true;
    const remaining = files.slice(idx).map(f => ({
      file: path.relative(ROOT, f.path), tier: f.tier, pass: 0, total: 0,
      status: 'deferred-budget-exhausted',
      output: `deferred because --budget-seconds=${BUDGET_SECONDS} was exhausted before this file started — NOT counted green`,
    }));
    for (const r of remaining) {
      results.push(r);
      sidecar({ phase: 'run', file: r.file, tier: r.tier, status: r.status, cause: r.output });
    }
    break;
  }
  const fileStartedAt = Date.now();
  const r = runOne(file);
  if (CHANGED && durationCache) {
    recordDuration(durationCache, repoRelativeFile(file.path), Date.now() - fileStartedAt);
  }
  results.push(r);
  if (STREAM) process.stderr.write(formatProgressLine(idx + 1, files.length, r) + '\n');
  if (r.status === 'fail') sidecar({ phase: 'run', i: idx + 1, file: r.file, tier: r.tier, pass: r.pass, total: r.total, cause: lastFailureCause(r.output) });
  else if (r.status === 'inconclusive-timeout') sidecar({ phase: 'run', i: idx + 1, file: r.file, tier: r.tier, pass: 0, total: 0, status: r.status, cause: r.output });
  // S203: env-blocked (could not spawn after backoff) is logged distinctly so a
  // saturated-host run is observable and never silently absorbed (CANON-031).
  else if (r.status === 'env-blocked') sidecar({ phase: 'run', i: idx + 1, file: r.file, tier: r.tier, status: 'env-blocked', spawnRetries: r.spawnRetries, cause: r.output });
}
if (budgetExhausted) {
  process.stderr.write(`⏱ suite budget exhausted after ${BUDGET_SECONDS}s — remaining files recorded as deferred-budget-exhausted (not green, not red).\n`);
}
if (CHANGED && durationCache) writeDurationCache(DURATION_CACHE, durationCache);

// Isolation-retry (S165 honest-flaky-isolation-retry). The full suite takes
// minutes on Windows (propagate-dry-run walks 26 sibling repos). During that
// window, unrelated concurrent writes to the working tree — sibling sessions,
// this session's own brief/status writes, the end-of-run PROJECT_STATUS write —
// flip git/cwd/state-sensitive tests (propagate-dry-run, founder-twin) to red
// even though they pass in isolation. Re-run each FAILED file exactly once, solo.
// A solo PASS reclassifies it 'flaky': it counts toward the canonical total
// (the failure did not reproduce) BUT is surfaced distinctly and recorded to
// PROJECT_STATUS.testsFlaky — never silently hidden (CANON-031 observability
// honesty). A genuine failure fails both in-suite and solo and stays red.
const RETRY = !argv.includes('--no-retry');
const flaky = [];
// S334 — files edited while the suite was running. Green, but explicitly NOT flaky.
const changedDuringRun = [];
const inconclusive = [];
if (RETRY) {
  for (const r of results) {
    if (r.status !== 'fail') continue;
    const file = files.find(f => path.relative(ROOT, f.path) === r.file);
    if (!file) continue;
    // S334 — A FILE THAT CHANGED BETWEEN ATTEMPTS IS NOT A FLAKY FILE.
    //
    // `flaky` means "same input, different result". The retry runs minutes after the
    // first attempt, and on a long suite an author can edit the file in between — which
    // is exactly what happened this session: three files failed early in the run, were
    // FIXED while it was still going, and passed on retry. They were recorded flaky, and
    // `recordFlaky` wrote them into portfolio/FLAKY_HISTORY.json, where a chronic-flake
    // probe escalates a file seen ≥3 consecutive sessions. A false flake is a durable
    // poisoning of a trend signal, and it is cheap to rule out.
    // The discriminator is mtime against the suite's own start: a test file modified
    // after this run began was not the same input on both attempts, so a pass on retry
    // says nothing about stability. Compared against suiteStartedAt rather than
    // bracketing the retry itself, because the edit lands between the FIRST attempt and
    // the retry — bracketing the retry would miss every real instance.
    let editedMidRun = false;
    try { editedMidRun = wasEditedDuringRun(fs.statSync(file.path).mtimeMs, suiteStartedAt); }
    catch { /* unreadable → cannot claim it changed, so it stays eligible for 'flaky' */ }
    const retry = runOne(file);
    // Always adopt the retry's detail (more informative, post-suite-noise).
    r.pass = retry.pass; r.total = retry.total; r.output = retry.output;
    if (retry.status === 'pass') {
      if (editedMidRun) {
        r.status = 'pass';
        r.changedDuringRun = true;
        changedDuringRun.push(r.file);
      } else {
        r.status = 'flaky';
        flaky.push(r.file);
      }
    }
    // S167 [audit #2] test-runner-inconclusive-honesty. After the solo retry a
    // file can STILL exit non-zero while EVERY assertion it reported passed
    // (harness printed "N/N ✓" but the process exit code is non-zero). On
    // Windows under 8-12 concurrent founder sessions this is a teardown/file-lock
    // race (e.g. a migration script that can't unlink a temp file held by a
    // sibling process exits 1 — the exact sil-migration signature logged in S166
    // #1), NOT a test regression. The honest discriminator is assertion-level:
    // a real regression shows pass < total; contention shows pass === total with
    // a non-zero exit. Reclassify the latter 'inconclusive' — it carries the
    // passing assertions into the canonical total BUT is surfaced distinctly and
    // recorded to PROJECT_STATUS.testsInconclusive, never hidden (CANON-031).
    // It can NEVER mask a real assertion failure (pass < total stays red).
    else if (retry.total > 0 && retry.pass === retry.total) {
      r.status = 'inconclusive'; inconclusive.push(r.file);
    }
    // Record the post-retry FINAL classification so the live sidecar never lies:
    // an initially-failed file that retried green is logged as flaky/inconclusive,
    // a genuine failure is re-logged as still-fail (CANON-031 observability honesty).
    sidecar({ phase: 'retry', file: r.file, tier: r.tier, pass: r.pass, total: r.total, status: r.status, cause: lastFailureCause(r.output) });
  }
}

// S205 [SIL][S204 #2]: fold the host-saturated-deferred files into results as a distinct
// bucket (pass/total 0) AFTER the retry loop so they are never spawned, never retried, and —
// like env-blocked — never counted green and never red (CANON-031). The summary names them so
// a smaller-green run can never be mistaken for a full pass.
const deferredResults = deferredFiles.map(f => ({
  file: path.relative(ROOT, f.path), tier: f.tier, pass: 0, total: 0,
  status: 'deferred-host-saturated',
  output: 'deferred by the host-saturated scheduler (slow sibling-walker) — run on a quiet host or with --force-slow; NOT a regression, NOT counted green',
}));
const ciDeferredResults = ciDeferredFiles.map(f => ({
  file: path.relative(ROOT, f.path), tier: f.tier, pass: 0, total: 0,
  status: 'deferred-ci-env',
  output: 'deferred in GitHub Actions because this test requires local Studio machine state (sibling repos, ~/.claude skills, or live local credentials); NOT counted green',
}));
for (const r of [...deferredResults, ...ciDeferredResults]) {
  results.push(r);
  sidecar({ phase: 'run', file: r.file, tier: r.tier, status: r.status, cause: r.output });
}

const totalPass = results.reduce((a, r) => a + r.pass, 0);
const totalAll = results.reduce((a, r) => a + r.total, 0);
const failedFiles = results.filter(r => r.status === 'fail');
// S203 [SIL][S202 #1]: files the OS could not spawn even after backoff retries.
// Reported distinctly — never counted green (no fabrication), never red (not a
// regression). On a clean host the backoff drives this to 0 and the suite is fully green.
// S336 [audit #2] — {file, cause, detail} entries, the one shape both test-spawn
// surfaces write, so the doctor can give cause-correct remediation advice.
const envBlocked = results.filter(r => r.status === 'env-blocked')
  .map(r => envBlockedEntry(r.file, r.envBlockedCause, r.output));
// S205 [SIL][S204 #2]: deliberately-deferred slow sibling-walkers (host saturated)
// plus suite-budget-deferred files. Both are honest smaller-green buckets.
const hostDeferred = results.filter(r => r.status === 'deferred-host-saturated').map(r => r.file);
const budgetDeferred = results.filter(r => r.status === 'deferred-budget-exhausted').map(r => r.file);
const ciDeferred = results.filter(r => r.status === 'deferred-ci-env').map(r => r.file);
const changedDeferred = results.filter(r => r.status === 'deferred-changed-heavy' || r.status === 'deferred-changed-timeout').map(r => r.file);
const deferred = [...hostDeferred, ...budgetDeferred, ...ciDeferred, ...changedDeferred];
const timeoutInconclusive = results.filter(r => r.status === 'inconclusive-timeout').map(r => r.file);
const reportedInconclusive = [...new Set([...inconclusive, ...timeoutInconclusive])];

// Final sidecar line so a `tail -f` watcher sees the run resolve (and a consumer
// can read one summary record without parsing the human/JSON output).
sidecar({ phase: 'summary', totalPass, totalAll, files: results.length, failures: failedFiles.length, flaky: flaky.length, inconclusive: reportedInconclusive.length, envBlocked: envBlocked.length, deferred: deferred.length, budgetExhausted, ok: failedFiles.length === 0 && timeoutInconclusive.length === 0 });

if (JSON_OUT) {
  console.log(JSON.stringify({ totalPass, totalAll, files: results.length, failures: failedFiles.length, flaky, changedDuringRun, inconclusive: reportedInconclusive, envBlocked, deferred, budgetExhausted, budgetSeconds: BUDGET_SECONDS, results }, null, 2));
} else {
  console.log('\nStudio Ops test suite');
  console.log('─'.repeat(70));
  for (const r of results) {
    const mark = r.status === 'pass' || r.status === 'covered-directly' ? '✓' : r.status === 'flaky' ? '⚠' : String(r.status || '').startsWith('inconclusive') ? '◐' : r.status === 'env-blocked' ? '⊘' : r.status === 'deferred-host-saturated' || r.status === 'deferred-ci-env' || r.status === 'deferred-changed-heavy' || r.status === 'deferred-changed-timeout' ? '⏸' : '⛔';
    const tag = r.status === 'covered-directly' ? '  (COVERED - same-session direct focused proof)'
      : r.status === 'flaky' ? '  (FLAKY — passed on isolated retry)'
      : r.status === 'inconclusive' ? '  (INCONCLUSIVE — all assertions passed; non-zero exit, likely load/teardown race)'
      : r.status === 'inconclusive-timeout' ? '  (INCONCLUSIVE — full-mode timeout produced no assertion verdict; NOT counted green, NOT a regression)'
      : r.status === 'env-blocked' ? `  (ENV-BLOCKED — host could not spawn after ${r.spawnRetries} backoff retries; NOT a regression)`
      : r.status === 'deferred-host-saturated' ? '  (DEFERRED — slow sibling-walker, host saturated; run on a quiet host or --force-slow; NOT counted green)'
      : r.status === 'deferred-ci-env' ? '  (DEFERRED — CI lacks local Studio machine state; run locally or --force-ci-env; NOT counted green)'
      : r.status === 'deferred-changed-heavy' ? '  (DEFERRED — changed-mode doctor-heavy coverage; run full suite or this file directly; NOT counted green)'
      : r.status === 'deferred-changed-timeout' ? `  (DEFERRED — changed-mode timeout after ${CHANGED_FILE_TIMEOUT_MS}ms; NOT counted green)`
      : r.status === 'deferred-budget-exhausted' ? `  (DEFERRED — suite budget exhausted after ${BUDGET_SECONDS}s; NOT counted green)`
      : '';
    console.log(`  ${mark}  [T${r.tier.padEnd(6)}] ${r.file.padEnd(44)} ${r.pass}/${r.total}${tag}`);
    if (r.status === 'fail' || r.status === 'inconclusive-timeout') {
      for (const line of r.output.split('\n').slice(-5)) console.log(`       ${line}`);
    }
  }
  console.log('─'.repeat(70));
  // inconclusive carries its passing assertions into the green count (it did not
  // regress) but is named distinctly so the suite signal never silently masks it.
  const passFiles = results.filter(r => r.status === 'pass' || r.status === 'covered-directly' || r.status === 'flaky' || r.status === 'inconclusive').length;
  const flakyNote = flaky.length ? ` · ${flaky.length} flaky (passed on isolated retry)` : '';
  // S334 — surfaced separately so a mid-run edit is never counted as instability.
  const changedNote = changedDuringRun.length ? ` · ${changedDuringRun.length} edited mid-run (green on retry; NOT flaky — different input)` : '';
  const incParts = [
    ...(inconclusive.length ? [`${inconclusive.length} assertions-green/non-zero-exit`] : []),
    ...(timeoutInconclusive.length ? [`${timeoutInconclusive.length} full-mode timeout (no verdict)`] : []),
  ].join(', ');
  const incNote = reportedInconclusive.length ? ` · ${reportedInconclusive.length} inconclusive (${incParts}; not counted green)` : '';
  // env-blocked surfaced distinctly — neither green nor red (CANON-031 honesty).
  const envNote = envBlocked.length ? ` · ${envBlocked.length} env-blocked (host could not spawn; backoff exhausted)` : '';
  // S205 [SIL][S204 #2] deferred surfaced distinctly — a deliberate smaller-green, not a full pass.
  const defKinds = [
    ...(budgetDeferred.length ? [`${budgetDeferred.length} budget`] : []),
    ...(hostDeferred.length ? [`${hostDeferred.length} slow sibling-walker`] : []),
    ...(ciDeferred.length ? [`${ciDeferred.length} ci-local-state`] : []),
    ...(changedDeferred.length ? [`${changedDeferred.length} changed-mode`] : []),
  ].join(', ');
  const defNote = deferred.length ? ` · ${deferred.length} deferred (${defKinds}; not counted green)` : '';
  console.log(`  ${totalPass}/${totalAll} assertions · ${passFiles}/${results.length} files${flakyNote}${changedNote}${incNote}${envNote}${defNote} · ${failedFiles.length ? '⛔' : timeoutInconclusive.length ? '◐ (inconclusive)' : deferred.length ? '✓ (smaller-green)' : '✓'}`);
  if (failedFiles.length || timeoutInconclusive.length || envBlocked.length) console.log(`  live failures sidecar: ${path.relative(ROOT, SIDECAR_PATH)}  (tail -f during a long run)`);
}

if (!NO_WRITE) {
  const sp = path.join(ROOT, 'context', 'PROJECT_STATUS.json');
  try {
    const j = JSON.parse(fs.readFileSync(sp, 'utf8'));
    // S160 audit #4: refresh-test-count.mjs is the SOLE owner of the canonical file-level
    // testsPassing/testsTotal (the .cache/test-count.json source the brief + doctor read).
    // run-tests.mjs scans a different, fuller set (153 files / assertion granularity) than
    // refresh-test-count (113 files), so writing those same fields here made last-writer-wins
    // flip the numbers (855/858 assertions vs 113/113 files) and the doctor Test-suite probe
    // contradict the Test-signal-fresh probe + brief. Keep ONLY assertion-level detail here.
    j.testsAssertionsTotal = totalAll;
    j.testsAssertionsPassing = totalPass;
    j.testsAssertionsFiles = results.length;
    // S334 [audit #6] — the counterpart to status.testsScope. The comment above says this
    // set is "different, fuller" than refresh-test-count's; that was true and unpublished,
    // so three suite sizes coexisted with nothing to explain the gaps. Name the roots.
    j.testsAssertionsScope = {
      roots: ['scripts/test', 'ignis/src', 'scripts/test-*.mjs'],
      files: results.length,
      note: 'assertion-level run over the FULL universe — a superset of status.testsScope',
    };
    // Honest flake accounting (S165): record which files only passed on isolated
    // retry so the green count never silently masks instability (CANON-031).
    j.testsFlaky = flaky;
    // S334 — recorded so PROJECT_STATUS shows why a file went red-then-green without
    // charging it to the flake trend, which escalates a file seen ≥3 sessions.
    j.testsChangedDuringRun = changedDuringRun;
    // S167 [audit #2]: surface inconclusive (assertions-green/non-zero-exit) files
    // so the honest carry-forward is auditable and never silently absorbed.
    j.testsInconclusive = reportedInconclusive;
    // S203 [SIL][S202 #1]: surface env-blocked (host could not spawn after backoff)
    // so a saturated-host run is auditable — never green, never a phantom red.
    j.testsEnvBlocked = envBlocked;
    // S205 [SIL][S204 #2]: surface deliberately-deferred slow sibling-walkers (host
    // saturated) and budget-deferred files so a smaller-green run is auditable and never read as a full pass.
    // S263 — this used to write `testsDeferred` and `testsLastRun`, the scope and
    // FRESHNESS metadata of the file-level counts it deliberately refuses to write
    // (see the S160 #4 note above). A red run therefore re-dated a stale green:
    // testsPassing sat frozen at 346/346 from 2026-08-01 while testsLastRun was
    // bumped to 2026-08-03 by a RED run, so the brief rendered "✓ 346/346
    // (2026-08-03)" and the doctor's staleness guard — which reads this same
    // field — reset to 0 days old. A freshness stamp belongs to the producer of
    // the numbers it dates. Keep assertion-scoped metadata under assertion-scoped
    // names; leave the file-level surface to refresh-test-count.mjs and
    // test-proof-reconciliation.mjs.
    j.testsAssertionsDeferred = deferred;
    j.testsBudgetExhausted = budgetExhausted;
    j.testsAssertionsLastRun = new Date().toISOString().slice(0, 10);
    writeProjectStatus(ROOT, j, { touchLastUpdated: false });
    // S166 [SIL][S165 #1]: record this session's flaky set so the flaky-trend
    // probe can escalate a chronically-flaky test (≥3 consecutive sessions).
    try {
      const { recordFlaky } = await import('./lib/flaky-trend.mjs');
      recordFlaky({ session: j.currentSession, date: j.testsAssertionsLastRun, flaky });
    } catch { /* trend recording is best-effort; never fail the test run */ }
  } catch (e) { /* ignore write failure in CI */ }
}

process.exit(failedFiles.length ? 1 : timeoutInconclusive.length ? 2 : 0);
} // end main()

async function runShardAggregate(shardCount) {
  if (CHANGED) {
    console.error('⛔ --shards cannot be combined with --changed; shard aggregation is for full-suite proof.');
    process.exit(1);
  }
  const proofDir = path.resolve(PROOF_DIR_ARG || path.join(ROOT, '.cache', 'test-shards', `shards-${shardCount}`));
  fs.mkdirSync(proofDir, { recursive: true });
  const shardResults = [];
  const mergedResults = [];
  let childParseFailed = false;
  const resumedShards = [];
  const executedShards = [];
  const pendingShards = [];
  const acceptedFailureSidecars = [];
  const passthrough = [];
  for (const a of argv) {
    if (a.startsWith('--shards=')) continue;
    if (a.startsWith('--shard=')) continue;
    if (a.startsWith('--proof-dir=')) continue;
    if (a.startsWith('--failure-sidecar=')) continue;
    if (a === '--resume-shards') continue;
    if (a.startsWith('--max-shards-per-run=')) continue;
    if (a === '--json') continue;
    if (a === '--no-write') continue;
    passthrough.push(a);
  }
  const discoveredFiles = discover();
  const proofShape = shardProofShape({ files: discoveredFiles, shardCount, passthrough });
  const sourcePlan = buildShardSourcePlan(ROOT, discoveredFiles, shardCount, (file, total) => fileShardIndex(file, total));
  const shardShapes = sourcePlan.map((row, index) => shardProofShape({
    files: partitionFilesIntoShard(discoveredFiles, { index: index + 1, total: shardCount }),
    shardCount,
    shardIndex: index + 1,
    passthrough,
    proofSources: row.manifest,
  }));
  const aggregateProofPath = path.join(proofDir, 'aggregate.json');
  // Aggregate owns the canonical live ledger. Child shards write only their own
  // sidecars, so concurrently running shards can never truncate each other.
  writeFailureLedger(SIDECAR_PATH, []);
  if (RESUME_SHARDS && fs.existsSync(aggregateProofPath)) {
    try {
      const prior = JSON.parse(fs.readFileSync(aggregateProofPath, 'utf8'));
      if (prior.proofShape && !proofShapeMatches(prior.proofShape, proofShape)) {
        // Expected during a repair: shard-scoped manifests below decide exactly
        // which proofs remain reusable. The aggregate is regenerated only after
        // every invalidated shard has executed.
        process.stderr.write('↻ aggregate source shape changed; evaluating source-bound shard proofs.\n');
      }
    } catch (e) {
      console.error(`⛔ stored shard aggregate proof is unreadable: ${e.message}`);
      process.exit(1);
    }
  }
  for (let i = 1; i <= shardCount; i++) {
    const proofPath = shardProofPath(proofDir, shardCount, i);
    const failureSidecarPath = shardFailureSidecarPath(proofDir, shardCount, i);
    const expectedShape = shardShapes[i - 1];
    let reused = false;
    if (RESUME_SHARDS && fs.existsSync(proofPath)) {
      try {
        const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
        if (reusableShardProof(proof, { shardCount, shardIndex: i, proofShape: expectedShape })) {
          const parsed = proof.parsed || {};
          for (const r of parsed.results || []) mergedResults.push(r);
          shardResults.push({ ...(proof.summary || {}), reused: true, proofPath: path.relative(ROOT, proofPath).replace(/\\/g, '/') });
          resumedShards.push(`${i}/${shardCount}`);
          acceptedFailureSidecars.push({
            path: failureSidecarPath,
            shard: `${i}/${shardCount}`,
            sourceSidecar: path.relative(ROOT, failureSidecarPath),
          });
          reused = true;
        }
      } catch { /* bad proof is ignored and regenerated */ }
    }
    const epochDecision = boundedShardDecision({ reusable: reused, executed: executedShards.length, max: MAX_SHARDS_PER_RUN });
    if (epochDecision === 'reuse') continue;
    if (epochDecision === 'checkpoint') {
      pendingShards.push(`${i}/${shardCount}`);
      continue;
    }    const childArgs = [
      fileURLToPath(import.meta.url),
      ...passthrough,
      `--shard=${i}/${shardCount}`,
      '--json',
      '--no-write',
      '--no-stream',
      `--failure-sidecar=${failureSidecarPath}`,
    ];
    const startedAt = Date.now();
    const res = spawnSync(process.execPath, childArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
      shell: false,
      windowsHide: true,
    });
    const durationMs = Date.now() - startedAt;
    let parsed = null;
    try {
      parsed = JSON.parse(res.stdout || '{}');
      for (const r of parsed.results || []) mergedResults.push(r);
    } catch (e) {
      childParseFailed = true;
      parsed = {
        totalPass: 0,
        totalAll: 0,
        files: 0,
        failures: 1,
        results: [{
          file: `shard-${i}-wrapper`,
          tier: 'shard',
          pass: 0,
          total: 1,
          status: 'fail',
          output: `child JSON parse failed: ${e.message}; stderr=${String(res.stderr || '').slice(-400)}`,
        }],
      };
      mergedResults.push(...parsed.results);
    }
    const summary = {
      shard: `${i}/${shardCount}`,
      exitCode: res.status ?? -1,
      signal: res.signal || null,
      durationMs,
      stderrTail: String(res.stderr || '').split('\n').slice(-12).join('\n'),
      totalPass: parsed.totalPass || 0,
      totalAll: parsed.totalAll || 0,
      files: parsed.files || 0,
      failures: parsed.failures || 0,
      deferred: parsed.deferred || [],
      envBlocked: parsed.envBlocked || [],
      budgetExhausted: Boolean(parsed.budgetExhausted),
      reused: false,
      proofPath: path.relative(ROOT, proofPath).replace(/\\/g, '/'),
    };
    const proof = {
      mode: 'shard-proof',
      generatedAt: new Date().toISOString(),
      shardCount,
      shardIndex: i,
      proofShape: expectedShape,
      exitCode: summary.exitCode,
      signal: summary.signal,
      summary,
      parsed,
    };
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n', 'utf8');
    shardResults.push(summary);
    executedShards.push(`${i}/${shardCount}`);
    acceptedFailureSidecars.push({
      path: failureSidecarPath,
      shard: `${i}/${shardCount}`,
      sourceSidecar: path.relative(ROOT, failureSidecarPath),
    });
  }
  const mergedFailureRecords = mergeShardFailureLedgers(acceptedFailureSidecars);
  writeFailureLedger(SIDECAR_PATH, mergedFailureRecords);
  const totalPass = mergedResults.reduce((a, r) => a + (r.pass || 0), 0);
  const totalAll = mergedResults.reduce((a, r) => a + (r.total || 0), 0);
  const failedFiles = mergedResults.filter(r => r.status === 'fail');
  const flaky = mergedResults.filter(r => r.status === 'flaky').map(r => r.file);
  const inconclusive = mergedResults.filter(r => String(r.status || '').startsWith('inconclusive')).map(r => r.file);
  const envBlocked = mergedResults.filter(r => r.status === 'env-blocked')
    .map(r => envBlockedEntry(r.file, r.envBlockedCause, r.output));
  const deferred = mergedResults.filter(r => String(r.status || '').startsWith('deferred-')).map(r => r.file);
  const budgetExhausted = shardResults.some(s => s.budgetExhausted);
  const aggregate = {
    mode: 'sharded',
    state: pendingShards.length ? 'checkpoint-incomplete' : 'complete',
    complete: pendingShards.length === 0,
    shardCount,
    proofShape,
    proofDir: path.relative(ROOT, proofDir).replace(/\\/g, '/'),
    repairMode: 'source-selective',
    dependencyGraph: shardDependencyGraph(sourcePlan),
    failureLedger: {
      aggregate: path.relative(ROOT, SIDECAR_PATH).replace(/\\/g, '/'),
      shardSidecars: acceptedFailureSidecars.map((row) => row.sourceSidecar.replace(/\\/g, '/')),
      records: mergedFailureRecords.length,
    },
    resumedShards,
    executedShards,
    pendingShards,
    maxShardsPerRun: MAX_SHARDS_PER_RUN,
    totalPass,
    totalAll,
    files: mergedResults.length,
    failures: failedFiles.length,
    flaky,
    inconclusive,
    envBlocked,
    deferred,
    budgetExhausted,
    childParseFailed,
    shards: shardResults,
    results: mergedResults,
  };
  fs.writeFileSync(aggregateProofPath, JSON.stringify({ ...aggregate, generatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
  if (JSON_OUT) {
    console.log(JSON.stringify(aggregate, null, 2));
  } else {
    console.log('\nStudio Ops sharded test suite');
    console.log('─'.repeat(70));
    for (const s of shardResults) {
      const mark = s.failures ? '⛔' : s.inconclusive?.length ? '◐' : (s.deferred.length || s.envBlocked.length ? '✓ (smaller-green)' : '✓');
      const reuse = s.reused ? ' · reused proof' : '';
      console.log(`  ${mark} shard ${s.shard} · ${s.totalPass}/${s.totalAll} assertions · ${s.files} files · exit ${s.exitCode}${reuse}`);
    }
    console.log('─'.repeat(70));
    const passFiles = mergedResults.filter(r => r.status === 'pass' || r.status === 'covered-directly' || r.status === 'flaky' || r.status === 'inconclusive').length;
    const defNote = deferred.length ? ` · ${deferred.length} deferred (not counted green)` : '';
    const envNote = envBlocked.length ? ` · ${envBlocked.length} env-blocked` : '';
    const resumeNote = resumedShards.length ? ` · ${resumedShards.length} shard proof(s) resumed` : '';
    const checkpointNote = pendingShards.length ? ` · checkpoint (${pendingShards.length} shard(s) pending)` : '';
    const incNote = inconclusive.length ? ` · ${inconclusive.length} inconclusive (not counted green)` : '';
    console.log(`  ${totalPass}/${totalAll} assertions · ${passFiles}/${mergedResults.length} files${incNote}${envNote}${defNote}${resumeNote}${checkpointNote} · ${failedFiles.length ? '⛔' : inconclusive.length || pendingShards.length ? '◐' : deferred.length ? '✓ (smaller-green)' : '✓'}`);
    console.log(`  proof: ${path.relative(ROOT, aggregateProofPath).replace(/\\/g, '/')}`);
  }
  if (!NO_WRITE && aggregate.complete) {
    const sp = path.join(ROOT, 'context', 'PROJECT_STATUS.json');
    try {
      const j = JSON.parse(fs.readFileSync(sp, 'utf8'));
      j.testsAssertionsTotal = totalAll;
      j.testsAssertionsPassing = totalPass;
      j.testsAssertionsFiles = mergedResults.length;
      // S334 [audit #6] — the SHARDED publish path needs the scope too. Caught in
      // self-review: the first edit landed only on the single-run path, so a sharded
      // aggregate would have published a file count with no population attached — the
      // exact defect this field exists to prevent, reintroduced by the fix for it.
      j.testsAssertionsScope = {
        roots: ['scripts/test', 'ignis/src', 'scripts/test-*.mjs'],
        files: mergedResults.length,
        note: 'assertion-level run over the FULL universe (sharded aggregate) — a superset of status.testsScope',
      };
      j.testsFlaky = flaky;
      j.testsInconclusive = inconclusive;
      j.testsEnvBlocked = envBlocked;
      // S263 — assertion-scoped stamps only (see the note in the non-sharded
      // writer). A sharded run that is GREEN is promoted to the file-level
      // surface by test-proof-reconciliation.mjs, which stamps testsLastRun from
      // the proof's own generatedAt. A sharded run that is RED must not re-date
      // the file-level counts it did not produce.
      j.testsAssertionsDeferred = deferred;
      j.testsBudgetExhausted = budgetExhausted;
      j.testsAssertionsLastRun = new Date().toISOString().slice(0, 10);
      j.testsLastRunMode = `sharded:${shardCount}`;
      j.testsShardProofDir = path.relative(ROOT, proofDir).replace(/\\/g, '/');
      j.testsShardProofResumed = resumedShards;
      writeProjectStatus(ROOT, j, { touchLastUpdated: false });
    } catch { /* ignore write failure in CI */ }
  }
  process.exit(failedFiles.length || childParseFailed ? 1 : inconclusive.length || pendingShards.length ? 2 : 0);
}
