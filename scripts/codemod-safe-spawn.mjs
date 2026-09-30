#!/usr/bin/env node
// codemod-safe-spawn.mjs — S187 import-rewire transform (also propagated to every repo).
// Rewrites every `import { ... } from '(node:)child_process'` under a scripts/ tree to
// import from the hardened ./lib/safe-spawn.mjs wrapper (windowsHide:true on every spawn).
// Deterministic single-line specifier swap — preserves the named-import list verbatim.
//
//   node scripts/codemod-safe-spawn.mjs --dry-run   # report only
//   node scripts/codemod-safe-spawn.mjs --apply      # write changes
//
// Exported as rewireToSafeSpawn(scriptsDir, {apply}) so apply-pending-propagation.mjs can
// run it IN a sibling repo at that repo's /start (lock-safe, in-process, no subprocess) —
// this is what ENFORCES the window-storm fix ecosystem-wide, not just ships the wrapper.

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
// Reuse the ONE canonical directory-walk ignore set — do NOT re-declare the literal
// (policy-drift-lint discipline, S188; same pattern as lib/committed-state.mjs).
import { WALK_IGNORE_DIRS } from "./lib/shared-policies.mjs";

const SKIP_DIRS = new Set([...WALK_IGNORE_DIRS, "coverage"]);
// Matches a direct child-process module import in a from-clause (single/double quote,
// optional node: prefix) and captures the surrounding quotes for the swap.
const IMPORT_RE = /(from\s*['"])(?:node:)?child_process(['"])/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".mjs") || name.endsWith(".js")) out.push(p);
  }
  return out;
}

/**
 * Rewire every direct child_process import under `scriptsDir` to the hardened
 * ./lib/safe-spawn.mjs wrapper. Skips the wrapper, the runtime shim, and the
 * shim's test (which intentionally use the raw module). Pure fs — no spawns —
 * so it is safe to call in-process from a /start propagation hook. Idempotent:
 * a file already importing safe-spawn.mjs is left untouched.
 * Returns { changed: [{file, rel}], scanned }.
 */
export function rewireToSafeSpawn(scriptsDir, { apply = false } = {}) {
  const wrapperAbs = join(scriptsDir, "lib", "safe-spawn.mjs");
  const skip = new Set([
    join(scriptsDir, "lib", "safe-spawn.mjs"),
    join(scriptsDir, "lib", "windows-hide-shim.cjs"),
    join(scriptsDir, "test", "tier1-windows-hide-shim.mjs"),
    join(scriptsDir, "codemod-safe-spawn.mjs"), // never rewrite our own descriptive comments
  ]);
  const changed = [];
  if (!existsSync(scriptsDir)) return { changed, scanned: 0 };
  const files = walk(scriptsDir);
  for (const file of files) {
    if (skip.has(file)) continue;
    const src = readFileSync(file, "utf8");
    if (!IMPORT_RE.test(src)) continue;
    IMPORT_RE.lastIndex = 0;
    let rel = relative(dirname(file), wrapperAbs).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    const next = src.replace(IMPORT_RE, `$1${rel}$2`);
    if (next !== src) {
      changed.push({ file, rel });
      if (apply) writeFileSync(file, next);
    }
  }
  return { changed, scanned: files.length };
}

// CLI entry — only when run directly.
const INVOKED_DIRECTLY =
  process.argv[1] && process.argv[1].endsWith("codemod-safe-spawn.mjs");
if (INVOKED_DIRECTLY) {
  const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const APPLY = process.argv.includes("--apply");
  const { changed } = rewireToSafeSpawn(join(ROOT, "scripts"), {
    apply: APPLY,
  });
  console.log(
    `${APPLY ? "APPLIED" : "DRY-RUN"}: ${changed.length} file(s) rewired to lib/safe-spawn.mjs`,
  );
  for (const c of changed.slice(0, 12))
    console.log(`  ${relative(ROOT, c.file).replace(/\\/g, "/")} → ${c.rel}`);
  if (changed.length > 12) console.log(`  … and ${changed.length - 12} more`);
  if (!APPLY) console.log("Run with --apply to write.");
}
