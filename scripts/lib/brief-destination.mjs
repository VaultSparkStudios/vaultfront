// brief-destination.mjs — S305 [audit #3] · adopted-with-review from Obelisk W271 cargo
// 01K0RSO70600E306871EC5157C.
//
// THE DEFECT. The test suite spawns the real startup-brief renderers at the real repo root,
// and both write TRACKED files (docs/STARTUP_BRIEF.md, docs/STARTUP_BRIEF_V5.md,
// context/SIGNALS.md). S300, S304 (hash-then-run: the brief plus 9 other tracked files changed,
// three of them append-only production ledgers) and Obelisk (a green/red oscillator and a
// twice-in-eleven-runs phantom failure, both traced to this one mechanism) confirmed it.
//
// One pure decision: in hermetic mode the renderer emits its bytes to a declared path or to
// stdout and NEVER to the tracked docs plane — and never a silent no-op, because skipping
// silently trades a mutation defect for an unmeasured one. The reason is stated on stderr.
//
// Hermetic mode is entered by env: STUDIO_BRIEF_OUT=<path> (write there) or
// STUDIO_BRIEF_NO_SIDE_EFFECTS=1 (stdout). Callers that also keep a state cache beside the
// brief must consult `skipSideEffect` and say so.

export const HERMETIC_ENV = ['STUDIO_BRIEF_OUT', 'STUDIO_BRIEF_NO_SIDE_EFFECTS'];

/**
 * @param {object} o  { env?, defaultPath, kind?: 'brief'|'brief-v5'|'signals'|'state' }
 * @returns {{hermetic:boolean, path:string|null, toStdout:boolean, skip:boolean, reason:string}}
 */
export function decideBriefDestination({ env = process.env, defaultPath, kind = 'brief' } = {}) {
  const out = env.STUDIO_BRIEF_OUT && String(env.STUDIO_BRIEF_OUT).trim();
  const noSide = String(env.STUDIO_BRIEF_NO_SIDE_EFFECTS || '') === '1';
  if (!out && !noSide) return { hermetic: false, path: defaultPath, toStdout: false, skip: false, reason: 'tracked destination (normal render)' };
  // Side artifacts (state caches, SIGNALS.md) have no hermetic destination: they are skipped
  // out loud so the render is still measurable as degraded.
  if (kind === 'state' || kind === 'signals') {
    return { hermetic: true, path: null, toStdout: false, skip: true, reason: `hermetic: ${kind} write skipped (STUDIO_BRIEF_${out ? 'OUT' : 'NO_SIDE_EFFECTS'})` };
  }
  if (out) {
    const path = kind === 'brief-v5' ? `${out}.v5.md` : out;
    return { hermetic: true, path, toStdout: false, skip: false, reason: `hermetic: ${kind} → ${path} (STUDIO_BRIEF_OUT)` };
  }
  return { hermetic: true, path: null, toStdout: true, skip: false, reason: `hermetic: ${kind} → stdout (STUDIO_BRIEF_NO_SIDE_EFFECTS=1)` };
}

/**
 * Emit the brief per the decision. Never silent in hermetic mode.
 * @returns {{wrote: string|null, skipped: boolean}}
 */
export function emitBrief(dest, body, { writeFileSync, stdout = process.stdout, stderr = process.stderr } = {}) {
  if (dest.hermetic) stderr.write(`  · ${dest.reason}\n`);
  if (dest.skip) return { wrote: null, skipped: true };
  if (dest.toStdout) { stdout.write(body.endsWith('\n') ? body : body + '\n'); return { wrote: 'stdout', skipped: false }; }
  writeFileSync(dest.path, body);
  return { wrote: dest.path, skipped: false };
}
