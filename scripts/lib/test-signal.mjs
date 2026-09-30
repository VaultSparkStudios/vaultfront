// test-signal.mjs — S263. One honest reading of "are the tests green?"
//
// THE DEFECT THIS EXISTS TO KILL
//
// PROJECT_STATUS.json carries two independent test surfaces:
//
//   file-level      testsPassing / testsTotal          owned by refresh-test-count.mjs
//                                                      and test-proof-reconciliation.mjs
//   assertion-level testsAssertionsPassing / ...Total  owned by run-tests.mjs
//
// They are deliberately separate (S160 #4: one shared pair of fields made
// last-writer-wins flip the numbers). But `testsLastRun` — the freshness stamp
// that every consumer renders NEXT TO the file-level counts — was written by
// BOTH. run-tests.mjs stamped `new Date()` on it while refusing to write the
// counts it dates.
//
// The consequence, observed live at S263 start:
//
//   testsPassing 346/346          frozen since 2026-08-01 (commit c302e046)
//   testsLastRun "2026-08-03"     bumped by a RED run on 08-02
//   testsAssertions 2170/2184     RED
//
// So a failing run REFRESHED THE FRESHNESS of a stale green it did not produce.
// The startup brief rendered "✓ Tests 346/346 (2026-08-03)". The doctor `tests`
// probe computes staleness from that same field, so its anti-phantom-green guard
// was reset to zero days old by the very run that failed. Brief and doctor both
// reported green, from one defect, while the suite was red.
//
// THE RULE
//
// A freshness stamp belongs to the producer of the numbers it dates. Beyond that,
// two surfaces measuring the same thing must be RECONCILED, not read
// independently — when a newer assertion-level run contradicts an older
// file-level green, the green is not evidence. Say CONTRADICTED and name both
// sides; never silently prefer the reassuring one (CANON-031).

/** Parse a YYYY-MM-DD or ISO stamp to epoch ms; NaN when absent/unparseable. */
function stamp(v) {
  if (!v) return NaN;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
}

function countList(v) {
  return Array.isArray(v) ? v.length : 0;
}

// ── S283 [audit #2]: was the file-level run BOUNDED? ─────────────────────────
//
// S263 (above) reconciled the two surfaces this module was built for. A third
// one then re-opened the same hole from underneath. Observed live at S283 start:
//
//   testsPassing 384 / testsTotal 384      →  passing === total
//   testsDeferred []                       →  zero deferrals, structurally
//   testsLastRun "2026-08-13"              →  newer than the assertion red
//   testsLastRunMode "… + changed:budget-deferred"
//   testsDeferredNote "… 30 files remained budget-deferred and are not counted green"
//
// The run was bounded — it stopped when a 120s budget ran out — and 30 files were
// never executed. But the ONLY machine-readable deferral field was an empty array,
// so `deferred` computed to 0, `passing === total` held, and the brief rendered
// "✓ Tests 384/384". The truth lived exclusively in prose that nothing parses.
//
// Worse, that same empty array made the bounded run look like a clean supersession:
// a genuine assertion-level red (2551/2561) was dismissed purely because the
// file-level stamp was newer — and the newer thing was the partial run. A signal
// that cannot go red no matter how many files are skipped is not a signal.
//
// So: a bound is a first-class fact. It is read from whichever surface records it,
// it never renders green, and it never supersedes a red. A structured field that
// disagrees with its own prose sibling is reported as the WRITER's defect, because
// that is where it must be fixed — a renderer patch would leave the empty array
// to mislead the next consumer.
const BOUNDED_MODE = /\b(?:budget[- ]?deferred|deferred|partial|bounded|truncated|timed?[- ]?out)\b/i;
const NOTE_CLAIMS_DEFERRAL = /(\d+)\s+files?\s+(?:remained\s+)?(?:budget[- ]?)?deferred|deferred\b[^.]*\bnot counted green/i;

/**
 * describeBound(status) -> { bounded, reason, claimedDeferred, structuredDeferred, writerDefect }
 *
 * `writerDefect` is true when prose claims deferrals the structured field denies —
 * the empty-array-beside-a-note shape that made the green unfalsifiable.
 */
export function describeBound(status = {}) {
  const structuredDeferred = countList(status.testsDeferred);
  const mode = String(status.testsLastRunMode ?? '');
  const note = String(status.testsDeferredNote ?? '');

  const modeBounded = BOUNDED_MODE.test(mode);
  const noteMatch = note.match(NOTE_CLAIMS_DEFERRAL);
  const claimedDeferred = noteMatch && noteMatch[1] ? Number(noteMatch[1]) : (noteMatch ? null : 0);
  const noteBounded = Boolean(noteMatch);

  const bounded = structuredDeferred > 0 || modeBounded || noteBounded;
  const writerDefect = structuredDeferred === 0 && (modeBounded || noteBounded);

  const reasons = [];
  if (structuredDeferred > 0) reasons.push(`${structuredDeferred} deferred file(s)`);
  if (modeBounded) reasons.push(`run mode "${mode}"`);
  if (noteBounded && claimedDeferred) reasons.push(`${claimedDeferred} file(s) named as deferred in testsDeferredNote`);
  else if (noteBounded) reasons.push('testsDeferredNote records deferrals');

  return {
    bounded,
    reason: reasons.join(' · '),
    claimedDeferred,
    structuredDeferred,
    writerDefect,
  };
}

/**
 * resolveTestSignal(status) -> {
 *   state:    'green' | 'red' | 'contradicted' | 'unknown'
 *   passing, total, deferred, lastRun,
 *   assertionsPassing, assertionsTotal, assertionsLastRun,
 *   ok:       boolean  — true ONLY for a clean green
 *   detail:   string   — human-readable, always names the evidence
 * }
 *
 * Pure function of the status object. No I/O, no clock — callers that need
 * staleness compare `lastRun` themselves, so this stays testable.
 */
export function resolveTestSignal(status = {}) {
  const passing = status.testsPassing;
  const total = status.testsTotal;
  const deferred = countList(status.testsDeferred);
  const lastRun = status.testsLastRun || null;

  const aPass = status.testsAssertionsPassing;
  const aTotal = status.testsAssertionsTotal;
  const aLastRun = status.testsAssertionsLastRun || null;

  const base = {
    passing, total, deferred, lastRun,
    assertionsPassing: aPass, assertionsTotal: aTotal, assertionsLastRun: aLastRun,
  };

  const fileLevelKnown = typeof passing === 'number' && typeof total === 'number' && total > 0;
  const assertionsKnown = typeof aPass === 'number' && typeof aTotal === 'number' && aTotal > 0;

  if (!fileLevelKnown && !assertionsKnown) {
    return { ...base, state: 'unknown', ok: false, detail: 'no test run recorded — run: node scripts/run-tests.mjs' };
  }

  let assertionsRed = assertionsKnown && aPass < aTotal;
  const fileRed = fileLevelKnown && passing < total;

  // Is the assertion-level red SUPERSEDED by a strictly newer file-level green?
  // Once a newer full green run lands, an older red is history. Without this the
  // signal would stay red forever after any single failure — and a gate nobody
  // can ever clear is a gate that gets ignored or disabled. Missing stamps are
  // treated as contemporaneous rather than "old", so an unstamped red is never
  // quietly dismissed.
  // S283: only an UNBOUNDED file-level green may supersede an older assertion
  // red. A partial run proves nothing about the files it never executed, so it
  // cannot retire evidence produced by a run that did execute them.
  const bound = describeBound(status);
  const fileMs = stamp(lastRun);
  const aMs = stamp(aLastRun);
  const assertionsSuperseded =
    !fileRed && !bound.bounded && Number.isFinite(fileMs) && Number.isFinite(aMs) && aMs < fileMs;
  if (assertionsSuperseded) assertionsRed = false;

  // The contradiction case: a CURRENT assertion-level RED standing beside a
  // file-level GREEN. The green describes a world that no longer exists.
  if (assertionsRed && !fileRed && fileLevelKnown) {
    return {
      ...base,
      state: 'contradicted',
      ok: false,
      detail:
        `file-level ${passing}/${total}${lastRun ? ` (${lastRun})` : ''} reads green, but the ` +
        `assertion-level run is RED at ${aPass}/${aTotal}${aLastRun ? ` (${aLastRun})` : ''} — ` +
        `the green is stale, not evidence`,
    };
  }

  // ── S315 [audit #2]: a file-level deficit with NO NAMED FAILURE is not RED ──
  //
  // Observed live at S315 start. PROJECT_STATUS.json held:
  //
  //   testsPassing 535 / testsTotal 537      →  a deficit of 2
  //   testsFailures []                       →  and not one file named
  //   testsAssertionsFiles 557               →  covering TWENTY MORE files than testsTotal
  //   testsAssertions 3533/3533              →  green
  //
  // The newest complete run ended `3533/3533 assertions · 555/557 files` at exit 0,
  // and both files the older run had recorded as failed passed on direct re-run.
  // The counts came from one run and the failure list from another, written into
  // one record as if they were a single measurement — so the record asserted that
  // two files failed while being unable to say which.
  //
  // The startup brief then published `⛔ Tests suite RED — 535/537 files` as the
  // founder's first signal of the session. That is the S313 class ("an empty array
  // is not an explanation") landing in the one number every session opens on.
  //
  // A deficit nothing can attribute is UNEXPLAINED, not red. It is still not green —
  // ok stays false and it still blocks a clean reading — but it sends the reader to
  // the record's own contradiction instead of to a suite that is passing. An
  // assertion-level red is real evidence and always outranks this: when the
  // assertions are red too, the branch below still says RED.
  // The state requires a CONTRADICTING GREEN HALF, not merely a nameless deficit.
  // Without a known assertion-level run there is nothing to contradict the file
  // count, so an unattributed deficit is simply a red whose detail is thin — and it
  // must stay red. Dropping this condition turned three long-standing contract
  // fixtures ('file-level red reads red on its own'; the S263 deferred-counted-into-
  // the-total rule; 'a real red still reads red') into false passes, which is the
  // precise shape of a fix that greens an assertion by removing its meaning.
  const namedFailures = countList(status.testsFailures);
  const coveredFiles = Number(status.testsAssertionsFiles);

  // S321 [audit #4] — THE EXPLANATION WAS TRAPPED IN THE BRANCH THAT NEEDS IT LEAST.
  //
  // This evidence — the two halves came from different runs — used to be computed
  // only inside the `unexplained` branch below, and that branch requires a
  // CONTRADICTING GREEN HALF (`!assertionsRed`). So the moment the assertion half
  // goes red too, the drift that EXPLAINS the reading becomes invisible, exactly
  // when a reader is trying to explain a red. Measured at S321: testsAssertionsFiles
  // 582 against testsTotal 566 — the file-level half sixteen files narrower — with
  // both halves red, and not a word of it printed anywhere.
  //
  // Computed once, here, so every branch below can carry it.
  const staleHalf = [];
  if (Number.isFinite(coveredFiles) && coveredFiles > total) {
    staleHalf.push(
      `the assertion run covered ${coveredFiles} files against testsTotal ${total}, so the file-level half is the narrower, older run`,
    );
  }
  if (Number.isFinite(fileMs) && Number.isFinite(aMs) && fileMs !== aMs) {
    staleHalf.push(fileMs < aMs
      ? `file-level stamp ${lastRun} predates the assertion stamp ${aLastRun}`
      : `file-level stamp ${lastRun} postdates the assertion stamp ${aLastRun}`);
  }

  if (fileRed && assertionsKnown && !assertionsRed && namedFailures === 0) {
    return {
      ...base,
      state: 'unexplained',
      ok: false,
      namedFailures,
      detail:
        `file-level ${passing}/${total}${lastRun ? ` (${lastRun})` : ''} is short by ${total - passing}, but ` +
        `testsFailures names NONE of them and the assertion run is green at ${aPass}/${aTotal}` +
        `${aLastRun ? ` (${aLastRun})` : ''} — the two halves came from different runs, so this is ` +
        `UNEXPLAINED, not red` +
        (staleHalf.length ? ` · ${staleHalf.join(' · ')}` : '') +
        ' · re-derive from one run: node scripts/run-tests.mjs',
    };
  }

  if (assertionsRed || fileRed) {
    // S293 — the two halves come from SEPARATE runs with separate stamps, and
    // this branch used to concatenate them bare: "386/390 files · 3005/3007
    // assertions" read as one measurement while the file count was from an
    // older run than the assertion count. The contradiction branch above is
    // careful to print both stamps; this one dropped them, so the staler half
    // borrowed the fresher half's credibility. Date each side whenever they did
    // not come from the same run.
    const sameRun = lastRun && aLastRun && lastRun === aLastRun;
    const parts = [];
    if (fileRed) parts.push(`${passing}/${total} files${!sameRun && lastRun ? ` (${lastRun})` : ''}`);
    if (assertionsRed) parts.push(`${aPass}/${aTotal} assertions${!sameRun && aLastRun ? ` (${aLastRun})` : ''}`);
    // S321 [audit #4] — carry the cross-run drift into the red reading too.
    return {
      ...base, state: 'red', ok: false,
      detail: `suite RED — ${parts.join(' · ')}`
        + (staleHalf.length ? ` · ⚠ ${staleHalf.join(' · ')}` : '')
        + (fileRed && namedFailures === 0 ? ' · testsFailures names none of them' : ''),
    };
  }

  // Nothing is red — but a bounded run is not green either. It is a run that
  // stopped early, and the files it skipped are unknown, not passing.
  if (bound.bounded) {
    const counts = `${passing}/${total} files${assertionsKnown ? ` · ${aPass}/${aTotal} assertions` : ''}`;
    const defect = bound.writerDefect
      ? ' — and testsDeferred is EMPTY while the run says otherwise, so the structured field is lying about its own run (fix the status writer, not the renderer)'
      : '';
    return {
      ...base,
      state: 'bounded',
      ok: false,
      bounded: true,
      boundReason: bound.reason,
      writerDefect: bound.writerDefect,
      detail: `${counts} — BOUNDED run, not a full green: ${bound.reason}${defect}`,
    };
  }

  const defNote = deferred ? ` · ${deferred} deferred (not counted green)` : '';
  return {
    ...base,
    state: 'green',
    ok: true,
    bounded: false,
    detail: `${passing}/${total} files${assertionsKnown ? ` · ${aPass}/${aTotal} assertions` : ''}${defNote}`,
  };
}

// ── S283: severity is the library's job, not each consumer's ────────────────
//
// Every consumer of resolveTestSignal enumerated the states it knew about
// (`state === 'contradicted' || state === 'red'`) and let everything else fall
// through to the green branch. That is fail-OPEN: adding 'bounded' would have
// rendered a checkmark in all four renderers, which is precisely the defect
// being fixed. Severity now lives beside the states it describes, so a future
// state is unrenderable-as-green by construction rather than by review.
//
// Callers should ask for the mark, not compare strings. Any unrecognised state
// is treated as NOT green — an unknown severity is never reassuring.
const SEVERITY = {
  green:        'ok',
  bounded:      'warn',
  unknown:      'warn',
  red:          'bad',
  contradicted: 'bad',
  // S315 [audit #2] — an unattributable file-level deficit is NOT-GREEN, like
  // `bounded` and `unknown`: the record contradicts itself and must be repaired,
  // but the suite it describes is passing. Listed EXPLICITLY rather than left to
  // the fail-closed default, because the default would print ⛔ and re-create the
  // false RED this state exists to end.
  unexplained:  'warn',
};

export function testSignalSeverity(signal = {}) {
  return SEVERITY[signal?.state] ?? 'bad';
}

export function testSignalMark(signal = {}) {
  const sev = testSignalSeverity(signal);
  return sev === 'ok' ? '✓' : sev === 'warn' ? '⚠' : '⛔';
}

export default { resolveTestSignal, describeBound, testSignalSeverity, testSignalMark };
