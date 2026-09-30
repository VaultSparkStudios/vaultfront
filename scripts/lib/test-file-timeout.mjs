// test-file-timeout.mjs — ONE per-file test timeout for both test-spawn surfaces.
//
// S338: run-tests.mjs and refresh-test-count.mjs are the studio's paired spawn surfaces,
// and notes in both say they must not diverge. They had: run-tests gave every file 300s
// in full mode, refresh-test-count hardcoded 60s (tier1) / 150s (tier2), retried at 1.5x.
// tier1-cli-risk-adoption-help passed in the full run and timed out in every refresh
// under host load (its "recorded duration" of 150,308ms was the two timeouts summed),
// so tier1-suite-scope-declared read 603 discovered vs 602 counted for a file that was
// green. The count tool published a coverage gap its sibling runner did not have.
//
// Pure and spawn-free, so both runners (and tests) can import it without side effects.

export const CHANGED_FILE_TIMEOUT_MS = parseInt(process.env.TEST_CHANGED_FILE_TIMEOUT_MS || '60000', 10);
export const FULL_FILE_TIMEOUT_MS = 300000;
export const FLEET_WALK_TIMEOUT_MS = 720000;

// S300 verification-found repair: the live registry fleet outgrew the original
// five-minute Windows budget. Keep changed mode bounded, preserve the normal full
// default, and grant only the known sequential fleet walker enough time to reach
// its strict terminal no-write assertion.
export function testFileTimeoutMs(file, { changed = false } = {}) {
  if (changed) return CHANGED_FILE_TIMEOUT_MS;
  const raw = typeof file === 'string' ? file : (file?.path || '');
  const name = raw.split(/[\\/]/).pop();
  return name === 'tier2-propagate-dry-run.mjs' ? FLEET_WALK_TIMEOUT_MS : FULL_FILE_TIMEOUT_MS;
}

export default { testFileTimeoutMs, CHANGED_FILE_TIMEOUT_MS, FULL_FILE_TIMEOUT_MS, FLEET_WALK_TIMEOUT_MS };
