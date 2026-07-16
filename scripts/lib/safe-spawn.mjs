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

import * as cp from "node:child_process";
import { promisify } from "node:util";
import { withGitWindowGuardEnv } from "./git-window-guard.mjs";

// Force windowsHide:true into a spawn-family call's options, matching every signature:
//   fn(cmd) · fn(cmd,args) · fn(cmd,opts) · fn(cmd,args,opts) · fn(cmd,cb) · fn(cmd,opts,cb)
// Locate the options object (last plain-object arg, not Array/Buffer/TypedArray/function);
// fill windowsHide only when the caller left it unset (explicit choices are respected).
// If no options object exists, insert one before a trailing callback, else append.
function harden(args) {
  const a = args.slice();
  let optIdx = -1;
  for (let i = a.length - 1; i >= 0; i--) {
    const v = a[i];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !Buffer.isBuffer(v) &&
      !ArrayBuffer.isView(v)
    ) {
      optIdx = i;
      break;
    }
  }
  if (optIdx >= 0) {
    a[optIdx] = {
      ...a[optIdx],
      windowsHide:
        a[optIdx].windowsHide === undefined ? true : a[optIdx].windowsHide,
      env: withGitWindowGuardEnv(a[optIdx].env || process.env),
    };
    return a;
  }
  if (a.length && typeof a[a.length - 1] === "function") {
    a.splice(a.length - 1, 0, {
      windowsHide: true,
      env: withGitWindowGuardEnv(),
    });
  } else {
    a.push({ windowsHide: true, env: withGitWindowGuardEnv() });
  }
  return a;
}

export function spawn(...args) {
  return cp.spawn(...harden(args));
}
export function spawnSync(...args) {
  return cp.spawnSync(...harden(args));
}
export function exec(...args) {
  return cp.exec(...harden(args));
}
export function execSync(...args) {
  return cp.execSync(...harden(args));
}
export function execFile(...args) {
  return cp.execFile(...harden(args));
}
export function execFileSync(...args) {
  return cp.execFileSync(...harden(args));
}
export function fork(...args) {
  return cp.fork(...harden(args));
}

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

export default {
  spawn,
  spawnSync,
  exec,
  execSync,
  execFile,
  execFileSync,
  fork,
  ChildProcess,
};
