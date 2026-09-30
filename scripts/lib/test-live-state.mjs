// test-live-state.mjs — S280 [audit #2]
//
// Some test files legitimately assert against LIVE session state rather than a
// fixture: `tier1-session-lock.mjs` verifies the real `context/.session-lock`
// that `/start` writes. Those files already DECLARE that dependency in a header
// annotation:
//
//     // @integration-live-state context/.session-lock
//
// Until S280 nothing read the annotation. The declared state was simply absent
// whenever no session happened to be open, the test threw, and the runner
// counted it as a FAILURE. Measured on 2026-08-13: the 01:54 automation run
// (no session) recorded `tier1-session-lock` as `exit 1`; the same file run at
// 07:25 with a lock present returned 9/9. Identical code, opposite verdicts,
// decided entirely by whether a human was mid-session.
//
// That number is not private. It is the `Tests` signal on STARTUP_BRIEF, the
// daily briefing, and the nightly self-audit — so the studio published
// "suite RED" on a morning when two of its five reds were phantom.
//
// The fix is NOT a new status class. `run-tests.mjs` already has exactly the
// right one: `env-blocked`, which per CANON-031 is never counted green and
// never counted red. A declared-but-absent precondition is precisely that —
// not a test result at all. This module only answers "which declared paths are
// missing", and both spawn surfaces share it.
//
// Why shared: `run-tests.mjs` and `refresh-test-count.mjs` are the studio's two
// paired test-spawn surfaces, and `run-tests.mjs` carries a standing S205 note
// that they "must not diverge" (the S153/S159 hazard). Putting the parser in
// one place is the whole point — a second copy is the bug.

import fs from 'node:fs';
import path from 'node:path';

// Only the header is scanned. An annotation buried 400 lines down is not a
// declaration a reader would see, and a bounded window keeps this cheap enough
// to run per-file on a 380-file suite.
const HEADER_LINE_LIMIT = 40;

export const ANNOTATION = '@integration-live-state';

/**
 * Parse declared live-state paths from a test file's header.
 * Returns [] when the file declares nothing (the overwhelming majority).
 *
 * Format: `// @integration-live-state <path> [<path> ...]`, repeatable.
 * Paths are repo-relative and may use either slash direction.
 */
export function declaredLiveState(source) {
  const out = [];
  const lines = String(source).split(/\r?\n/, HEADER_LINE_LIMIT);
  for (const line of lines) {
    const at = line.indexOf(ANNOTATION);
    if (at === -1) continue;
    // The annotation must BE a comment, not merely appear inside one's text.
    // Found the hard way on the first full-suite run after this shipped:
    // `tier1-test-ambient-state.mjs:14` holds the annotation inside a string
    // literal as its own test fixture —
    //   const source = "// @integration-live-state context/.session-lock\nconst lock = …";
    // — and the naive scan parsed `path.join(ROOT,` and friends as declared
    // paths, found them absent, and env-blocked a test that was perfectly
    // runnable. A suppression mechanism that suppresses the wrong file is
    // strictly worse than no suppression: it hides real coverage while the
    // board stays calm. Requiring the LINE to open with a comment marker is
    // what separates a declaration from a mention of one.
    if (!/^\s*(\/\/|\/\*|\*|#)/.test(line)) continue;
    // Everything after the annotation on that line, minus a trailing comment
    // terminator, split on whitespace. Deliberately simple: the annotation is
    // ours, so it does not need to survive arbitrary syntax.
    const rest = line.slice(at + ANNOTATION.length).replace(/\*\/\s*$/, '').trim();
    for (const token of rest.split(/\s+/)) {
      // S336 [audit #2 root-fix] — a token is a declared PATH only if it looks like
      // one. This used to accept every whitespace-separated token, which made the
      // parser unable to tell a path list from prose:
      //
      //   // @integration-live-state — this file deliberately scans the LIVE working tree
      //
      // parsed as NINE declared paths ("—", "this", "file", …), none of which exist,
      // so `tier2-context-wipe-guard.mjs` was env-blocked permanently. That single
      // file held the `tests` probe at pass:false, which held `remedy-drift` blocking
      // — the studio's only blocking doctor red for SEVEN consecutive sessions, whose
      // declared fix (`refresh-test-count --full`) could never clear it because the
      // cause was a parsing artifact, not a missing precondition. Run directly, the
      // file passes 47/47.
      //
      // The prose form is DELIBERATE, not a typo: the ambient-state firewall's own
      // test blesses `// @integration-live-state whole working tree` as a legitimate
      // declaration. A file may honestly declare that it reads live state in general
      // without naming one checkable path — that is a BARE declaration, and a bare
      // declaration names no precondition to be absent.
      if (token && isPathLike(token)) out.push(token);
    }
  }
  return out;
}

/**
 * Does this token name a repo-relative path?
 *
 * Accepts three shapes, and nothing else:
 *   - contains a path separator      `context/.session-lock`
 *   - is a dotfile at the repo root  `.session-lock`
 *   - ends in a file extension       `AGENTS.md`, `absent-1757.json`
 *
 * The separator-only rule shipped first and was wrong in the costly direction: it
 * outlawed a legitimate design. A declaration may name a file at the repo root, which
 * has no separator, and `tier2-live-state-classification` asserts exactly that in both
 * directions. Rejecting `AGENTS.md` would have made an annotated test stop being
 * blocked when its real precondition WAS absent — the counter-direction that suite
 * exists to guard, and a strictly worse failure than the one being fixed. Caught by
 * running the neighbouring suite rather than by reasoning about the rule.
 *
 * What all three shapes have and prose does not is a filename's own punctuation.
 * English words — `this`, `file`, `LIVE`, `working`, `tree`, an em dash — carry none,
 * which is what lets a bare prose declaration be recognised as bare rather than as a
 * list of absent paths.
 */
export function isPathLike(token) {
  const t = String(token || '');
  if (!t) return false;
  if (/[/\\]/.test(t)) return true;     // a separator is unambiguous
  if (/^\.[\w-]/.test(t)) return true;  // dotfile at the repo root
  return /\.\w{1,8}$/.test(t);          // a file extension, e.g. AGENTS.md
}

/**
 * Which of a test file's declared live-state paths are absent right now.
 *
 * @param {string} testPath  absolute path to the test file
 * @param {string} root      repo root that declared paths resolve against
 * @returns {{declared: string[], missing: string[]}}
 */
export function missingLiveState(testPath, root) {
  let source;
  try {
    source = fs.readFileSync(testPath, 'utf8');
  } catch {
    // Unreadable file is a real problem, but it is not THIS module's problem —
    // let the spawn surface report it as the failure it is.
    return { declared: [], missing: [] };
  }
  const declared = declaredLiveState(source);
  if (!declared.length) return { declared: [], missing: [] };
  const missing = declared.filter((rel) => !fs.existsSync(path.resolve(root, rel)));
  return { declared, missing };
}

/**
 * The single sentence both spawn surfaces print. Naming the exact absent path
 * matters: "env-blocked" with no cause is the kind of unexplained non-result
 * that gets ignored until someone suppresses the file entirely.
 */
export function liveStateBlockedMessage(missing) {
  return `declared live state absent (${missing.join(', ')}) — this test asserts against real session state via `
    + `${ANNOTATION} and cannot produce a verdict without it; run /start first. NOT a test regression, NOT green.`;
}
