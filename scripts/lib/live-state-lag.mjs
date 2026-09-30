// live-state-lag.mjs — classify a (producer artifact, persister artifact) pair
// into coherent / persist-lag / incoherent / unknown (S340 #2, [SIL:2⛔] at S342).
//
// Why this exists: six live-state tests compared something a PRODUCER just wrote
// (a doctor snapshot, a test-count cache, a lease heartbeat, a warning set)
// against what a PERSISTER last wrote (PROJECT_STATUS, a lock, a provenance map),
// and each went red whenever the producer ran after the persister mid-session.
// S339 had four such reds, S340 two, S342 three — none the same pair. A bare
// assertion failure cannot tell "the persister has not run yet" from "the two
// artifacts contradict each other", so every one was triaged by hand.
// `failingCoherent()` grew the third state for one pair (S340 [audit #3]); this is
// that state, generalised so any pair can name it, with the remedy attached.
//
// The four states:
//   coherent     values agree (per `equal`). Timestamps are irrelevant then.
//   persist-lag  values differ AND the producer is strictly newer than the
//                persister: the persister simply has not run since. Not a
//                contradiction — the remedy (re-run the persister) clears it.
//   incoherent   values differ and the persister is the same age or newer: it
//                ran after the producer and still disagrees. A real defect.
//   unknown      a value is ABSENT (undefined), or a timestamp is missing or
//                unparseable, or the timestamps overlap so the order cannot be
//                decided. Never silently coherent: two absent values are
//                Object.is-equal, which is exactly the vacuous green this refuses
//                (null is a value; undefined is the absence of one — null ≠ 0).
//
// Day-resolution stamps: several persisters write only `YYYY-MM-DD` (e.g.
// PROJECT_STATUS.testsLastRun). Such a stamp is treated as the WHOLE day, not
// midnight — reading it as midnight would call any same-day producer "newer"
// and launder a real divergence as lag. A producer inside the persister's day
// is therefore `unknown`, not `persist-lag`.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * Resolve a timestamp into a closed-open window [start, end) in ms.
 * Point-in-time stamps have start === end. Returns null when unusable.
 * @param {string|number|Date|null|undefined} at
 * @returns {{ start: number, end: number, dayResolution: boolean } | null}
 */
export function stampWindow(at) {
  if (at == null || at === '') return null;
  if (at instanceof Date) {
    const t = at.getTime();
    return Number.isFinite(t) ? { start: t, end: t, dayResolution: false } : null;
  }
  if (typeof at === 'number') {
    return Number.isFinite(at) ? { start: at, end: at, dayResolution: false } : null;
  }
  if (typeof at !== 'string') return null;
  if (DATE_ONLY.test(at)) {
    const start = Date.parse(`${at}T00:00:00.000Z`);
    return Number.isFinite(start) ? { start, end: start + DAY_MS, dayResolution: true } : null;
  }
  const t = Date.parse(at);
  return Number.isFinite(t) ? { start: t, end: t, dayResolution: false } : null;
}

const show = (v) => {
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
};

/**
 * classifyLiveState({ producer, persister, equal, remedy, label })
 *
 * @param {object} args
 * @param {{ value: *, at: string|number|Date, name?: string }} args.producer
 *   the artifact that computes the live value (runs often, e.g. mid-session)
 * @param {{ value: *, at: string|number|Date, name?: string }} args.persister
 *   the artifact that records it durably (runs at closeout / on demand)
 * @param {(a: *, b: *) => boolean} [args.equal=Object.is]  value comparison;
 *   pass a set/deep comparator for non-scalar pairs (warning sets, lock ids)
 * @param {string} [args.remedy]  the command that re-runs the persister
 * @param {string} [args.label]   what is being compared, for the detail line
 * @returns {{ state: 'coherent'|'persist-lag'|'incoherent'|'unknown', detail: string, remedy: string|null }}
 */
export function classifyLiveState({ producer, persister, equal = Object.is, remedy = null, label = 'value' } = {}) {
  const pName = producer?.name || 'producer';
  const sName = persister?.name || 'persister';
  const pv = producer?.value;
  const sv = persister?.value;

  if (pv === undefined || sv === undefined) {
    const which = [pv === undefined && pName, sv === undefined && sName].filter(Boolean).join(' + ');
    return { state: 'unknown', detail: `${label}: ${which} value absent — cannot compare (absent is not equal)`, remedy: null };
  }
  if (equal(pv, sv)) {
    return { state: 'coherent', detail: `${label}: ${pName} and ${sName} agree (${show(pv)})`, remedy: null };
  }

  const differ = `${label}: ${sName} ${show(sv)} ≠ ${pName} ${show(pv)}`;
  const pw = stampWindow(producer?.at);
  const sw = stampWindow(persister?.at);
  if (!pw || !sw) {
    const which = [!pw && `${pName}.at=${show(producer?.at)}`, !sw && `${sName}.at=${show(persister?.at)}`].filter(Boolean).join(', ');
    return { state: 'unknown', detail: `${differ}; order undecidable — missing/unparseable timestamp (${which})`, remedy: null };
  }
  if (pw.start >= sw.end && pw.start > sw.start) {
    // Strictly after the persister's whole window: the persister has not run since.
    return {
      state: 'persist-lag',
      detail: `${differ}, but ${pName} (${show(producer.at)}) is newer than ${sName} (${show(persister.at)}) — persist lag, not a contradiction`
        + (remedy ? `; run: ${remedy}` : '; no remedy supplied — the caller must name the persister to re-run'),
      remedy: remedy || null,
    };
  }
  if (sw.start >= pw.end) {
    return { state: 'incoherent', detail: `${differ}; ${sName} (${show(persister.at)}) is not older than ${pName} (${show(producer.at)}) — it ran after and still disagrees`, remedy: null };
  }
  return {
    state: 'unknown',
    detail: `${differ}; order undecidable — ${pName} (${show(producer.at)}) falls inside ${sName}'s ${sw.dayResolution ? 'day-resolution ' : ''}stamp (${show(persister.at)})`,
    remedy: null,
  };
}
