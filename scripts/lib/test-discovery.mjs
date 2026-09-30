/**
 * test-discovery.mjs — S313 [audit #2]. THE definition of "the test suite".
 *
 * Two runners disagreed about what the suite is, and the narrower one was the
 * founder-facing one. `run-tests.mjs` discovered every non-underscore `.mjs` under
 * scripts/test (551 files with the legacy + IGNIS lanes, 3461 assertions).
 * `refresh-test-count.mjs` filtered `/^tier[12]-.*\.mjs$/` and therefore never saw
 * 59 files: 50 written in the `<name>.test.mjs` convention and 9 more — including
 * every `tier3-*` file, because the regex enumerated tiers 1 and 2 and a tier 3
 * exists. Its artifact then published `total 340 · ratio 100`.
 *
 * The counter was scrupulous about the gap it KNEW about — deferred, deferredFiles,
 * deferredBudgetFiles, envBlocked, inconclusiveFiles and quarantineDetail all exist so
 * that an unrun file is never fabricated as passing. It had no field at all for a file
 * it never discovered, so 11.5% of the suite was absent from the numerator, the
 * denominator, and every honesty field built to catch exactly this.
 *
 * The repair is not a wider regex. It is one definition, imported by both, plus an
 * `undiscovered` bucket so that any future filter which drops files has to SAY so.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Files prefixed `_` are shared harness/fixture modules, not tests. */
export const isHarnessModule = (name) => name.startsWith('_');

/** The tier a test file declares in its name; `?` when it declares none. */
export function tierOf(name) {
  return name.match(/^tier(\d)/)?.[1] || '?';
}

/**
 * Every test file under scripts/test, by the single definition both runners use.
 * @param {string} testDir absolute path to scripts/test
 * @returns {string[]} bare file names, sorted
 */
export function discoverSuiteFiles(testDir) {
  let entries;
  try { entries = readdirSync(testDir); } catch { return []; }
  return entries
    .filter((f) => f.endsWith('.mjs') && !isHarnessModule(f))
    .sort();
}

/**
 * Account for the full on-disk universe. Every discovered file lands in exactly one
 * bucket, and `undiscovered` is whatever a caller's own candidate filter dropped — the
 * field whose absence was the defect.
 *
 * @param {object} args
 * @param {string} args.testDir            absolute path to scripts/test
 * @param {string[]} args.executed         bare names actually run
 * @param {string[]} [args.deferred]       bare names deliberately not run this pass
 * @param {string[]} [args.quarantined]    bare names held out by the quarantine ledger
 * @param {string[]} [args.envBlocked]     bare names that could not produce a verdict
 * @returns {{universe:number, executed:number, deferred:number, quarantined:number,
 *            envBlocked:number, undiscovered:number, undiscoveredFiles:string[],
 *            accountedFor:number, complete:boolean}}
 */
export function accountForSuite({ testDir, executed = [], deferred = [], quarantined = [], envBlocked = [] }) {
  const universe = discoverSuiteFiles(testDir);
  const seen = new Set([...executed, ...deferred, ...quarantined, ...envBlocked]);
  const undiscoveredFiles = universe.filter((f) => !seen.has(f));
  const accountedFor = universe.length - undiscoveredFiles.length;
  return {
    universe: universe.length,
    executed: executed.length,
    deferred: deferred.length,
    quarantined: quarantined.length,
    envBlocked: envBlocked.length,
    undiscovered: undiscoveredFiles.length,
    undiscoveredFiles,
    accountedFor,
    // The invariant: buckets sum to what is on disk. A filter that drops files makes
    // this false rather than silently shrinking the denominator.
    complete: undiscoveredFiles.length === 0,
  };
}

/** Convenience: absolute paths for a set of bare names. */
export const toPaths = (testDir, names) => names.map((n) => join(testDir, n));
