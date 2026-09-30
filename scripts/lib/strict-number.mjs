/**
 * strict-number.mjs — S351 [self-audit]. One predicate for "is this a number,
 * really?", so the repo stops growing private copies of it.
 *
 * WHY THIS EXISTS, AND WHY IT IS SLIGHTLY EMBARRASSING
 *
 * S351's central finding was that `Number(null)` is `0` and `0` is finite, so
 * `Number.isFinite(Number(x))` admits the null it was written to reject. The
 * fix was placed at the chokepoint every receipt consumer imports — and then
 * the same session wrote TWO MORE private copies of the same predicate, inline,
 * in `boot-amortization.mjs` and `render-studio-brain.mjs`, while the audit doc
 * argued that a guarantee attached to a caller is not attached to the fact.
 * Three implementations of one rule is the condition the session set out to
 * remove. This module is the correction.
 *
 * IT ALSO CLOSES A HOLE IN THE LINT
 *
 * `check-null-vs-absent`'s coercion rule matches `Number.isFinite(Number(x.prop))`
 * — a PROPERTY access, because the nullability evidence base is keyed on property
 * names. Hoist the value into a local first:
 *
 *     const raw = row.session;
 *     Number.isFinite(Number(raw))        // ← identical defect, lint sees nothing
 *
 * and the guard goes blind. Both hand-written fixes used that exact shape, so
 * they were correct on the day and unprotected the day after. Routing every such
 * check through one named function means the property access happens once, in a
 * file that is tested directly, instead of N times in files that are not.
 *
 * SEMANTICS
 *   null · undefined · '' · whitespace · NaN · Infinity  → null   (not a reading)
 *   0 and negative numbers                               → themselves
 *   numeric strings                                      → their number
 *
 * `0` is deliberately preserved: a literal zero is a value someone WROTE, and
 * conflating it with absence is the same defect pointing the other way.
 */

/**
 * strictNumber(value) -> number | null
 *
 * The one predicate. Refuses every value `Number()` would silently turn into a
 * number without the caller meaning it.
 */
export function strictNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;            // Number(false) === 0
  if (typeof value === 'string' && value.trim() === '') return null;
  if (Array.isArray(value)) return null;                  // Number([]) === 0, Number([5]) === 5
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** True when `value` is a real, finite numeric reading. */
export function isReading(value) {
  return strictNumber(value) !== null;
}

/**
 * firstReading(...values) -> number | null — the first value that is a real
 * reading, preserving "unknown" when none is. Use instead of `a ?? b ?? 0`,
 * which cannot tell a deliberate null from a missing key.
 */
export function firstReading(...values) {
  for (const v of values) {
    const n = strictNumber(v);
    if (n !== null) return n;
  }
  return null;
}

export default { strictNumber, isReading, firstReading };
