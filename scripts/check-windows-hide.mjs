#!/usr/bin/env node
// check-windows-hide.mjs — S186 window-storm guard, BROADENED in S187.
//
// THE BUG (observed live, S186 + S187): on Windows a Node child_process spawn pops a
// VISIBLE Git Bash / mingw console window per call unless `windowsHide: true` is set.
// A hot-path spawner — run-doctor.mjs (~90 probe children), run-tests.mjs (~190) —
// therefore (a) floods the screen with focus-stealing windows that make the machine
// UNUSABLE, and (b) trips Windows Defender's behavioral heuristic
// `Trojan:Win32/SuspExec.SE` (rapid mass shell execution looks like malware). Both
// share ONE root cause: a burst of un-hidden child spawns.
//
// WHY S186's guard was incomplete: it keyed ONLY on `shell: true`. But plain
// `spawn(node, [...])` / `spawnSync(node, [...])` with NO shell storms identically —
// that is exactly what run-doctor.mjs did, and the guard never flagged it. The
// correct rule is broader: EVERY spawn sets windowsHide:true.
//
// S187 mechanizes that via scripts/lib/safe-spawn.mjs — a hardened drop-in that forces
// windowsHide:true on every spawn. So the PRIMARY invariant is now structural and
// simple to enforce:
//
//   PRIMARY (S187): no script imports `child_process` directly — all spawn calls go
//   through ./lib/safe-spawn.mjs (allow-list: the wrapper itself, the runtime shim,
//   and the shim's test, which intentionally probe the raw module).
//   LEGACY (S186): any literal `shell: true` spawn still must set windowsHide:true
//   (covers the wrapper internals + any raw-module allow-listed file).
//
// Usage:
//   node scripts/check-windows-hide.mjs            # human report, exit 1 on violations
//   node scripts/check-windows-hide.mjs --json     # machine output
//
// Propagated studio-wide (CANON-016): every project ships this guard + safe-spawn.mjs
// + windows-hide-shim.cjs so no agent, in any repo, can reintroduce the window-storm.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// Reuse the ONE canonical directory-walk ignore set — do NOT re-declare the literal
// (policy-drift-lint discipline, S188; same pattern as lib/committed-state.mjs).
import { WALK_IGNORE_DIRS } from './lib/shared-policies.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// Directories to skip (no source spawns we own / vendored): canonical set + 'coverage'.
const SKIP_DIRS = new Set([...WALK_IGNORE_DIRS, 'coverage']);

// ── S301 [audit #14] — THE GUARD MUST SCAN WHAT THE REPO ACTUALLY SHIPS ──────
//
// Every scanner below defaulted to `join(ROOT, 'scripts')`, and the CLI called
// all three with no argument — so the scan universe was `scripts/` alone while
// the header two dozen lines up claimed studio-wide scope under CANON-016. The
// guard reported all-green with seven real un-hidden spawns sitting just
// outside its root. Two of them are not incidental:
//
//   portfolio/ignis-core/scripts/ignis/run-all.mjs branches to cmd.exe on win32
//   across a 39-step pipeline — 39 visible console windows per run — and
//   portfolio/ignis-core/INSTALL.md tells every sibling to copy those files in,
//   so the storm is DISTRIBUTED, not local.
//
//   studio-ops-mcp/server.mjs spawns once per MCP tool call inside a live
//   session.
//
// The lesson is the one this repo keeps relearning: a checker's scope is part
// of its claim. Narrowing the scope silently narrows the guarantee, and nothing
// downstream can tell the difference between "clean" and "not looked at".
// SCAN_ROOTS is therefore explicit and asserted — a root that disappears is a
// finding, never a silent shrink back toward scripts/-only.
export const SCAN_ROOTS = [
  'scripts',
  'studio-ops-mcp',
  'ignis',
  'portfolio/ignis-core',
  'workers',
  'worker',
  'studio-console',
  'ops',
  'spark-funnel',
  'plugins',
];

// Files allowed to import the raw `child_process` module: the hardened wrapper (which
// MUST), the runtime preload shim (CommonJS, patches the global module), and the shim's
// own test (intentionally spies on the raw module). Paths are repo-relative, POSIX.
// S301 audit #14 — two more wrappers join the list. They are not exemptions: each
// is the single hardened entry point for a tree that CANNOT import the studio
// wrapper (a distributed package and a separately-compiled TS root), and each
// forces windowsHide the same way. Allow-listing the wrapper is what lets every
// other file in those trees be held to the rule.
const RAW_CP_ALLOWLIST = new Set([
  'scripts/lib/safe-spawn.mjs',
  'scripts/lib/windows-hide-shim.cjs',
  'scripts/test/tier1-windows-hide-shim.mjs',
  'portfolio/ignis-core/scripts/ignis/_safe-spawn.mjs',
  'ignis/src/safe-exec.ts',
]);

// A direct import/require of node:child_process (any quote/spacing, with or without node: prefix).
//
// S301 audit #14 — DYNAMIC IMPORT WAS A HOLE. The pattern matched only static
// `from '...'` and `require('...')`, so `await import('child_process')` sailed
// past it — which is exactly how ignis/src/bridge/mcp-server.ts:209 kept a raw
// handle to the module while the guard reported clean. A rule that three syntaxes
// can express must be checked in all three.
const RAW_CP_RE = /(?:from\s*['"]|require\(\s*['"]|import\(\s*['"])(?:node:)?child_process['"]/;

function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out; // a declared root that does not exist here — reported by loadSources, not swallowed
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.mjs') || name.endsWith('.js') || name.endsWith('.cjs') || name.endsWith('.ts')) out.push(p);
  }
  return out;
}

// ── S301 [audit #17] — ONE WALK, ONE READ, ONE COMMENT-STRIP ────────────────
//
// The three scanners each walked the whole tree and re-read every file, and two
// of them additionally applied the identical comment-stripping regexes to every
// file independently: measured 400ms + 337ms + 393ms over ~700 files, i.e. ~750ms
// spent on two redundant passes. Widening SCAN_ROOTS multiplies that cost, so the
// single-pass loader lands in the same change as the widening.
//
// `stripped` is the comment-free source the pattern scanners need; `raw` is the
// untouched source the import scanner needs (an import line is never a comment
// we want to forgive). Both are computed once per file.
const COMMENT_BLOCK_RE = /\/\*[\s\S]*?\*\//g;
const COMMENT_LINE_RE = /(^|[^:])\/\/[^\n]*/g;

/**
 * Load every source file under the given roots exactly once.
 *
 * @param {string|string[]} roots  Repo-relative root(s), or an absolute path
 *   (back-compat: the scanners used to take a single absolute directory).
 * @returns {{ files: Array<{relPath: string, raw: string, stripped: string}>, missingRoots: string[] }}
 */
export function loadSources(roots = SCAN_ROOTS) {
  const list = Array.isArray(roots) ? roots : [roots];
  const files = [];
  const missingRoots = [];
  const seen = new Set();
  for (const r of list) {
    const abs = r.includes(':') || r.startsWith('/') ? r : join(ROOT, r);
    const found = walk(abs);
    if (!found.length) {
      let exists = true;
      try { statSync(abs); } catch { exists = false; }
      if (!exists) missingRoots.push(r);
    }
    for (const file of found) {
      const relPath = relative(ROOT, file).replace(/\\/g, '/');
      if (seen.has(relPath)) continue; // overlapping roots must not double-report
      seen.add(relPath);
      const raw = readFileSync(file, 'utf8');
      files.push({
        relPath,
        raw,
        stripped: raw.replace(COMMENT_BLOCK_RE, '').replace(COMMENT_LINE_RE, '$1'),
      });
    }
  }
  return { files, missingRoots };
}

/** Accept preloaded sources, a roots list, or a single legacy absolute root. */
function resolveSources(input) {
  if (input && typeof input === 'object' && Array.isArray(input.files)) return input;
  return loadSources(input === undefined ? SCAN_ROOTS : input);
}

// Scan for scripts that import child_process directly instead of the hardened
// wrapper. Pure file reads — no child spawns — safe to call in-process from a test.
export function scanDirectChildProcessImports(input) {
  const { files } = resolveSources(input);
  const violations = [];
  for (const { relPath, raw } of files) {
    if (RAW_CP_ALLOWLIST.has(relPath)) continue;
    if (relPath.endsWith('check-windows-hide.mjs')) continue; // the guard's own pattern source is not a call site
    if (!RAW_CP_RE.test(raw)) continue;
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (RAW_CP_RE.test(lines[i])) violations.push({ file: relPath, line: i + 1 });
    }
  }
  return violations;
}

// For each `shell: true` (any spacing), look in a ±450-char window for both a
// spawn-family caller and a `windowsHide: true`. A shell:true spawn missing
// windowsHide in its own options object is a violation.
const SHELL_RE = /shell\s*:\s*true/g;
const SPAWN_NEAR = /\b(spawnSync|spawn|execSync|execFileSync|execFile|exec|fork)\s*\(/;
const HIDE_RE = /windowsHide\s*:\s*true/;

// Scan a tree for shell:true spawns missing windowsHide:true. Pure file reads —
// no child spawns — so it is safe to call in-process from a test.
export function scanWindowsHide(input) {
  const { files } = resolveSources(input);
  const violations = [];
  // This is a source guard, not a prose linter. Comments routinely explain why
  // shell mode is avoided; treating those words as executable options creates
  // false failures and hides real regressions in noise. `stripped` is the
  // comment-free source, computed once per file by loadSources().
  for (const { relPath, stripped: src } of files) {
    if (relPath.endsWith('check-windows-hide.mjs')) continue; // don't lint the guard's own pattern doc
    SHELL_RE.lastIndex = 0;
    let m;
    while ((m = SHELL_RE.exec(src)) !== null) {
      const idx = m.index;
      const before = src.slice(Math.max(0, idx - 450), idx);
      const window = src.slice(Math.max(0, idx - 450), Math.min(src.length, idx + 450));
      if (!SPAWN_NEAR.test(before)) continue;       // not a spawn options object
      if (HIDE_RE.test(window)) continue;            // properly hidden
      const line = src.slice(0, idx).split('\n').length;
      violations.push({ file: relPath, line });
    }
  }
  return violations;
}


// S206 root-cause guard: shell-resolving literal `node` is the window-storm/DEP0190
// source when `process.execPath` would work. `npx`/`.cmd` shim calls may still need
// a shell on Windows; literal node does not.
const LITERAL_NODE_SPAWN_NEAR = /\b(spawnSync|spawn|execFileSync|execFile)\s*\(\s*['"]node['"]/;

export function scanShellNodeSpawns(input) {
  const { files } = resolveSources(input);
  const violations = [];
  for (const { relPath, stripped: src } of files) {
    if (relPath.endsWith('check-windows-hide.mjs')) continue;
    SHELL_RE.lastIndex = 0;
    let m;
    while ((m = SHELL_RE.exec(src)) !== null) {
      const idx = m.index;
      const before = src.slice(Math.max(0, idx - 450), idx);
      if (!LITERAL_NODE_SPAWN_NEAR.test(before)) continue;
      const line = src.slice(0, idx).split('\n').length;
      violations.push({ file: relPath, line });
    }
  }
  return violations;
}

// ── S301 [audit #14] — COMSPEC / cmd.exe SPAWNS ─────────────────────────────
//
// The three scanners above key on `shell: true` or a raw child_process import.
// portfolio/ignis-core/scripts/ignis/run-all.mjs does neither: it resolves
// `process.env.ComSpec || 'cmd.exe'` and spawns it with /d /s /c. That is a
// shell spawn by every meaning except the literal option name, and it was the
// single largest un-hidden spawner in the repo. Detect the interpreter itself.
const COMSPEC_RE = /\b(?:ComSpec|cmd\.exe|['"]sh['"]|['"]bash['"])\b/;

export function scanInterpreterSpawns(input) {
  const { files } = resolveSources(input);
  const violations = [];
  for (const { relPath, stripped: src } of files) {
    if (relPath.endsWith('check-windows-hide.mjs')) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!COMSPEC_RE.test(lines[i])) continue;
      if (!SPAWN_NEAR.test(lines[i])) continue;      // must be the spawn call itself
      // Balanced-scope check rather than a ±N character window (S275): look at
      // the call's own statement, from this line to the first line that closes it.
      let scope = '';
      for (let j = i; j < Math.min(lines.length, i + 12); j++) {
        scope += lines[j] + '\n';
        const opens = (scope.match(/\(/g) || []).length;
        const closes = (scope.match(/\)/g) || []).length;
        if (opens > 0 && opens <= closes) break;
      }
      if (HIDE_RE.test(scope)) continue;
      violations.push({ file: relPath, line: i + 1 });
    }
  }
  return violations;
}
// CLI entry — only when run directly (not on import).
const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith('check-windows-hide.mjs');
if (INVOKED_DIRECTLY) {
  const JSON_OUT = process.argv.includes('--json');
  // ONE walk/read/strip pass shared by all four scanners (S301 audit #17).
  const sources = loadSources(SCAN_ROOTS);
  const shellViolations = scanWindowsHide(sources);          // legacy: shell:true missing windowsHide
  const rawImports = scanDirectChildProcessImports(sources);  // primary: direct child_process import
  const shellNodeSpawns = scanShellNodeSpawns(sources);        // root-cause: literal node behind shell:true
  const interpreterSpawns = scanInterpreterSpawns(sources);    // S301: cmd.exe/ComSpec/sh spawned directly
  const total = shellViolations.length + rawImports.length + shellNodeSpawns.length + interpreterSpawns.length;
  // A declared root that has vanished must never read as "clean" — the scope IS
  // the claim (S301 audit #14), so a shrunken scan universe is itself a finding.
  const scopeOk = sources.missingRoots.length === 0;
  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: total === 0 && scopeOk,
      count: total,
      scannedRoots: SCAN_ROOTS,
      missingRoots: sources.missingRoots,
      filesScanned: sources.files.length,
      directChildProcessImports: rawImports,
      shellTrueMissingHide: shellViolations,
      shellNodeSpawns,
      interpreterSpawns,
    }, null, 2));
  } else if (total === 0 && scopeOk) {
    console.log(`✓ windows-hide: ${sources.files.length} file(s) across ${SCAN_ROOTS.length} root(s) — all spawns route through lib/safe-spawn.mjs and set windowsHide:true (no window-storm / no SuspExec heuristic)`);
  } else {
    if (!scopeOk) {
      console.log(`⛔ windows-hide: ${sources.missingRoots.length} declared scan root(s) missing — the guard's scope is part of its claim, so an unscanned root is not a clean result:`);
      for (const r of sources.missingRoots) console.log(`   ${r}`);
    }
    if (interpreterSpawns.length) {
      console.log(`⛔ windows-hide: ${interpreterSpawns.length} direct interpreter spawn(s) (cmd.exe/ComSpec/sh) missing windowsHide:true — one visible console window per call:`);
      for (const v of interpreterSpawns) console.log(`   ${v.file}:${v.line}`);
    }
    if (rawImports.length) {
      console.log(`⛔ windows-hide: ${rawImports.length} direct child_process import(s) — route through ./lib/safe-spawn.mjs instead (windowsHide:true is forced there):`);
      for (const v of rawImports) console.log(`   ${v.file}:${v.line}`);
    }
    if (shellNodeSpawns.length) {
      console.log(`⛔ windows-hide:  shell-resolved literal node spawn(s) — use process.execPath instead (window-storm root):`);
      for (const v of shellNodeSpawns) console.log(`   ${v.file}:${v.line}`);
    }
    if (shellViolations.length) {
      console.log(`⛔ windows-hide: ${shellViolations.length} shell:true spawn(s) missing windowsHide:true — they pop a console window per call on Windows:`);
      for (const v of shellViolations) console.log(`   ${v.file}:${v.line}`);
      console.log('   Fix: add `windowsHide: true` to the spawn options object (§0 no-OS-window).');
    }
  }
  process.exit(total === 0 && scopeOk ? 0 : 1);
}
