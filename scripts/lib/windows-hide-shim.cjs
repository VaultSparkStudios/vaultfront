// windows-hide-shim.cjs — S187 (founder-flagged window-storm, hard root-fix)
//
// THE BUG (observed live, twice — S186 + S187): on Windows, a Node child_process
// spawn pops a VISIBLE console (Git Bash / mingw) window per call unless
// `windowsHide: true` is set. A hot-path spawner (run-doctor.mjs spawning ~90
// probes, run-tests.mjs spawning ~190 children) therefore floods the screen with
// windows that STEAL FOCUS — the founder cannot type, click, or use any app while
// the storm runs. This is not a background annoyance; it makes the machine unusable.
//
// WHY S186's fix was incomplete: it keyed the guard on `shell: true` only. But the
// real storm source is plain `spawn(node, [...])` / `spawnSync(node, [...])` with
// NO shell and NO options — those pop windows too. The correct rule is broader:
// EVERY child_process spawn must set windowsHide:true on Windows, regardless of
// shell. This shim enforces that universally, at runtime, for ALL call sites (our
// 90+ spawns AND any node_modules dependency AND any future code) in one place.
//
// WIRING: preloaded via `NODE_OPTIONS=--require <abs path to this file>` so every
// node process the harness/agent launches inherits it (see scripts/install-windows-hide-shim.mjs).
// It is also safe to `require()` directly at the top of an entrypoint as a backstop.
// CommonJS (.cjs) because `--require` cannot load ESM.
//
// Idempotent: re-requiring (e.g. a child re-inheriting NODE_OPTIONS) is a no-op.

"use strict";

// Only patch on Windows — POSIX has no console-window concept and windowsHide is ignored,
// but skipping keeps the shim a strict no-op everywhere else.
if (process.platform === "win32") {
  const cp = require("child_process");

  if (!cp.__windowsHideShimInstalled) {
    // configurable:true so the install is re-runnable — required because S195 wired this
    // shim as a global `NODE_OPTIONS=--require` preload, so by the time anything else wants
    // to (re)patch child_process (a test that installs spies, or a re-wire), the flag is
    // already set. A non-configurable flag would make that re-patch a permanent no-op
    // (the exact break that took tier1-windows-hide-shim red — S198).
    Object.defineProperty(cp, "__windowsHideShimInstalled", {
      value: true,
      enumerable: false,
      configurable: true,
    });

    // Force windowsHide:true into a spawn-family call's options object.
    // Handles every signature shape:
    //   fn(cmd) · fn(cmd, args) · fn(cmd, opts) · fn(cmd, args, opts)
    //   fn(cmd, cb) · fn(cmd, opts, cb)            (async exec/execFile)
    // by locating the existing options object (the last plain-object arg that is
    // not an Array / Buffer / TypedArray / function) and setting windowsHide unless
    // the caller explicitly chose a value. If there is no options object, one is
    // inserted in the correct position (before a trailing callback, else appended).
    const GIT_WINDOW_GUARD_ENV = {
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "true",
      SSH_ASKPASS: "true",
      GCM_INTERACTIVE: "never",
      GIT_EDITOR: "true",
      GIT_SEQUENCE_EDITOR: "true",
      GIT_MERGE_AUTOEDIT: "no",
      GIT_PAGER: "cat",
      TERM: "dumb",
    };

    function withGitWindowGuardEnv(env) {
      const source = env || process.env;
      if (source && source.VAULTSPARK_GIT_WINDOW_GUARD_DISABLED === "1")
        return Object.assign({}, source);
      return Object.assign({}, source, GIT_WINDOW_GUARD_ENV);
    }

    function harden(args) {
      const a = Array.prototype.slice.call(args);

      let optIdx = -1;
      for (let i = a.length - 1; i >= 0; i--) {
        const v = a[i];
        const isPlainObject =
          v !== null &&
          typeof v === "object" &&
          !Array.isArray(v) &&
          !Buffer.isBuffer(v) &&
          !ArrayBuffer.isView(v);
        if (isPlainObject) {
          optIdx = i;
          break;
        }
      }

      if (optIdx >= 0) {
        // Respect an explicit windowsHide choice; always inherit the non-interactive Git guard.
        a[optIdx] = Object.assign({}, a[optIdx], {
          windowsHide:
            a[optIdx].windowsHide === undefined ? true : a[optIdx].windowsHide,
          env: withGitWindowGuardEnv(a[optIdx].env),
        });
        return a;
      }

      // No options object present — insert one without breaking a trailing callback.
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

    // util.promisify.custom is a globally-registered well-known symbol; native
    // exec/execFile carry an implementation that makes `promisify(exec)` resolve to
    // { stdout, stderr }. Re-attach it (S198) — see the loop below.
    const { promisify } = require("util");

    for (const name of [
      "spawn",
      "spawnSync",
      "exec",
      "execSync",
      "execFile",
      "execFileSync",
      "fork",
    ]) {
      const orig = cp[name];
      if (typeof orig !== "function") continue;
      const patched = function (...args) {
        return orig.apply(this, harden(args));
      };
      // Preserve identity/metadata so callers checking fn.name still see the original.
      Object.defineProperty(patched, "name", {
        value: name,
        configurable: true,
      });
      // CRITICAL (S198): a plain wrapper does NOT inherit the original's
      // `util.promisify.custom` implementation, so wrapping exec/execFile WITHOUT
      // re-attaching it silently strips the { stdout, stderr } promisify contract —
      // `promisify(exec)` then falls back to resolving the BARE stdout STRING, crashing
      // every `const { stdout } = await execAsync(...)` caller. Because this shim is
      // GLOBALLY preloaded via NODE_OPTIONS (S195), that break hit every node process in
      // the studio (and cascaded through lib/safe-spawn.mjs, which builds on cp.exec).
      // Re-point the custom impl through harden so promisify stays byte-identical to native.
      const origCustom = orig[promisify.custom];
      if (typeof origCustom === "function") {
        patched[promisify.custom] = function (...args) {
          return origCustom.apply(this, harden(args));
        };
      }
      cp[name] = patched;
    }
  }
}
