// safe-spawn.mjs — S187 (founder-flagged window-storm + Defender SuspExec.SE root-fix)
//
// Drop-in hardened replacement for `node:child_process`. Every studio script imports
// its spawn family from HERE instead of 'child_process', so EVERY spawn sets
// `windowsHide: true` by construction — no call-site can forget it.
//
// WHY THIS EXISTS (observed live, S186 + S187):
//   On Windows a Node child_process spawn pops a VISIBLE Git Bash / mingw console
//   window per call unless windowsHide:true is set. Hot-path spawners — run-doctor.mjs
//   (~90 probe children), run-tests.mjs (~190) — therefore (a) flood the screen with
//   focus-stealing windows that make the machine unusable, and (b) trip Windows
//   Defender's behavioral heuristic `Trojan:Win32/SuspExec.SE` (rapid mass shell
//   execution looks like malware). Both symptoms share ONE root cause: a burst of
//   un-hidden child spawns. Hiding every window (CREATE_NO_WINDOW via windowsHide)
//   removes the visible storm; routing every spawn through one wrapper makes the
//   guarantee total and lint-enforceable.
//
//   S186's earlier guard keyed on `shell: true` only — but plain `spawn(node, [...])`
//   with no shell storms identically. The correct, broader rule is: EVERY spawn sets
//   windowsHide:true. This module is that rule, mechanized.
//
// Usage — identical to child_process:
//   import { spawnSync, execSync } from '<rel>/lib/safe-spawn.mjs';
// Enforced by scripts/check-windows-hide.mjs (no direct child_process import outside
// this wrapper) and propagated studio-wide (CANON-016).

import * as cp from 'node:child_process';
import { promisify } from 'node:util';
import { withGitWindowGuardEnv } from './git-window-guard.mjs';
import { fastNodePath } from './fast-node.mjs';

// S292 [audit #1] — spend the node spawn tax once, not 191 times.
//
// The installed node binary carries a measured 7-12x path-specific tax (900-1900 ms
// per invocation vs 60-190 ms for a byte-identical copy elsewhere). 256 studio call
// sites pass `process.execPath` as argv0, and every one of them already routes
// through this wrapper — so the mitigation is one substitution here rather than 256
// edits. See lib/fast-node.mjs for the guarantee and the fail-closed contract.
//
// SUBSTITUTE ONLY THE EXACT INSTALLED BINARY. A caller naming 'node', 'npm', 'npx'
// or any other command is left completely alone: those resolve through PATH and
// carry semantics this module has no business changing. Verified this session that
// nothing in scripts/ or ignis/ builds paths relative to process.execPath, so the
// clone's neighbours are never consulted.
function substituteNodeExe(args) {
  if (!args.length || typeof args[0] !== 'string') return args;
  if (args[0] !== process.execPath) return args;
  const fast = fastNodePath(process.execPath);
  if (fast === process.execPath) return args; // unprovisioned / drifted / opted out
  const a = args.slice();
  a[0] = fast;
  return a;
}

// Force windowsHide:true into a spawn-family call's options, matching every signature:
//   fn(cmd) · fn(cmd,args) · fn(cmd,opts) · fn(cmd,args,opts) · fn(cmd,cb) · fn(cmd,opts,cb)
// Locate the options object (last plain-object arg, not Array/Buffer/TypedArray/function);
// fill windowsHide only when the caller left it unset (explicit choices are respected).
// If no options object exists, insert one before a trailing callback, else append.
function harden(args) {
  // argv0 substitution first, so every spawn-family export inherits it (including
  // the promisify.custom paths below). fork() is unaffected by construction: its
  // first argument is a module path, which can never equal process.execPath.
  const a = substituteNodeExe(args).slice();
  let optIdx = -1;
  for (let i = a.length - 1; i >= 0; i--) {
    const v = a[i];
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !Buffer.isBuffer(v) &&
      !ArrayBuffer.isView(v)
    ) { optIdx = i; break; }
  }
  if (optIdx >= 0) {
    a[optIdx] = {
      ...a[optIdx],
      windowsHide: a[optIdx].windowsHide === undefined ? true : a[optIdx].windowsHide,
      env: withGitWindowGuardEnv(a[optIdx].env || process.env),
    };
    return a;
  }
  if (a.length && typeof a[a.length - 1] === 'function') {
    a.splice(a.length - 1, 0, { windowsHide: true, env: withGitWindowGuardEnv() });
  } else {
    a.push({ windowsHide: true, env: withGitWindowGuardEnv() });
  }
  return a;
}

export function spawn(...args) { return cp.spawn(...harden(args)); }
export function spawnSync(...args) { return cp.spawnSync(...harden(args)); }

// spawnExact — hardened exactly like spawnSync (windowsHide + git window guard),
// but with NO argv0 substitution: it runs the literal binary it is handed.
//
// THIS EXISTS BECAUSE THE MITIGATION BLINDED ITS OWN INSTRUMENT (S292, caught live).
// `node-spawn-tax.mjs` measures the installed binary against a control copy, and it
// spawns through this wrapper. The moment substitution went in, its "installed" arm
// silently became the clone: it reported `installed 100ms · no tax` while an
// unsubstituted measurement of the same binary, seconds later, read 1580 ms. A
// measurement instrument must observe the subject, never the mitigation — so any
// code whose PURPOSE is to compare node binaries must use this, not spawnSync.
// Asserted by scripts/test/tier1-fast-node.mjs.
export function spawnExact(...args) {
  // Reuse harden() for the windowsHide/env contract, then restore the caller's argv0.
  const hardened = harden(args);
  if (args.length && typeof args[0] === 'string') hardened[0] = args[0];
  return cp.spawnSync(...hardened);
}
export function exec(...args) { return cp.exec(...harden(args)); }
export function execSync(...args) { return cp.execSync(...harden(args)); }
export function execFile(...args) { return cp.execFile(...harden(args)); }
export function execFileSync(...args) { return cp.execFileSync(...harden(args)); }
export function fork(...args) { return cp.fork(...harden(args)); }

// Preserve the util.promisify contract that native cp.exec / cp.execFile carry.
// Native exec/execFile expose a `util.promisify.custom` implementation that resolves
// to { stdout, stderr }. A plain wrapper function does NOT inherit that symbol, so
// `promisify(exec)` would fall back to generic behavior and resolve the bare stdout
// STRING instead — making `const { stdout } = await execAsync(...)` undefined and
// crashing every caller (S188 regression: the S187 codemod rewired all child_process
// imports HERE, silently breaking batch-push.mjs + check-registry-drift.mjs). Re-attach
// the custom symbol, still hardened (windowsHide via harden), so promisify(exec) behaves
// byte-identically to native.
const _execP = promisify(cp.exec);
const _execFileP = promisify(cp.execFile);
exec[promisify.custom] = (...args) => _execP(...harden(args));
execFile[promisify.custom] = (...args) => _execFileP(...harden(args));

// Pass through anything else child_process exports (ChildProcess, constants, etc.).
export const { ChildProcess } = cp;

export default { spawn, spawnSync, exec, execSync, execFile, execFileSync, fork, ChildProcess };

