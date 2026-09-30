// sil-ledger.mjs — one parser for the append-only, mixed-format SIL ledger.
//
// SELF_IMPROVEMENT_LOOP.md is append-only but not physically ordered and carries
// several historical header shapes. Session number, never document position, is
// the ordering authority. Every consumer gets the same parsed block contract.

// `##` ONLY — a `###` sub-heading is an ADDENDUM to the session above it, not a
// session of its own. Matching `###` here made every addendum a phantom duplicate
// entry carrying `total: null`, and (because addenda are appended out of document
// order) sometimes sorted that phantom AHEAD of the real entry. Historical
// `##`-level addenda that carry their own `Total:` are unaffected and stay
// first-class entries, which is the format S180/S183 actually used.
const HEADER_RE = /^##(?!#)[^\n]*\bSession\s+(\d+)\b[^\n]*$/gmi;

/**
 * A session's score can be REVISED after the fact by an addendum:
 *   `### 2026-08-10 — Session 275 addendum | Score revised: 982 → 985 | Kind: …`
 * The ledger has used this convention since S272, but no consumer understood it —
 * every reader reported the superseded base score. The last revision in a block
 * wins; `Score retained: N` deliberately asserts no change and is not a revision.
 */
// Attribution is BY NAME, never by document position. The ledger is append-only and
// physically unordered, so an addendum for S273 can sit inside the byte range of the
// S274 block — attributing revisions positionally silently rescored the neighbouring
// session (S274 read 982, which was S273's revision). The addendum header names its
// own session; that name is the authority, exactly as session number (not position)
// is the ordering authority everywhere else in this parser.
const REVISION_RE =
  /^###[^\n]*\bSession\s+(\d+)\b[^\n]*?\bScore\s+revised:\s*(\d+)\s*(?:→|->|—>|–>)\s*(\d+)/gim;

/** session number → revisions in document order (last one wins). */
function revisionsBySession(markdown) {
  const map = new Map();
  for (const m of String(markdown).matchAll(REVISION_RE)) {
    const session = Number(m[1]);
    if (!map.has(session)) map.set(session, []);
    map.get(session).push({ from: Number(m[2]), to: Number(m[3]) });
  }
  return map;
}

const CATEGORY_ALIASES = new Map([
  ['cross-repo coherence', 'Cross-Repo Coherence'],
  ['cross-repo coher', 'Cross-Repo Coherence'],
  ['ecosystem integration', 'Ecosystem Integration'],
  ['ecosystem integ', 'Ecosystem Integration'],
  ['automation coverage', 'Automation Coverage'],
  ['automation cover', 'Automation Coverage'],
  ['engagement (infra)', 'Engagement'],
]);

function numberMatch(text, label) {
  const re = new RegExp(`(?:\\*\\*)?${label}:(?:\\*\\*)?\\s*(\\d+)`, 'i');
  const value = String(text).match(re)?.[1];
  return value == null ? null : Number(value);
}

function totalMatch(text) {
  const match = String(text).match(/(?:\*\*)?Total:(?:\*\*)?\s*(\d+)\/(\d+)/i);
  return match ? { total: Number(match[1]), max: Number(match[2]) } : { total: null, max: null };
}

/**
 * S323 — READ THE CURRENT COLUMN, NOT THE FIRST ONE.
 *
 * THE DEFECT. The row regex captured the FIRST numeric cell after the label. The
 * live table is `| Category | Prev | Now | Trend | Note |`, so every consumer of
 * `entry.categories` was reading the PREVIOUS session's scores under the current
 * session's heading — plausible at a glance, because they are real numbers in the
 * right range and they move.
 *
 * Measured live before the fix: `decompose-sil-gap` published `Process Quality
 * 93/100 gap=7` for S322, whose actual Process Quality is **82** (gap 18). The
 * founder-facing gap decomposition was showing S321's numbers as current, and the
 * single largest gap in the ledger was invisible. The same shifted series fed
 * `generate-innovation-pack`'s "SIL category drop" detector (comparing two Prev
 * columns, so it notices a drop one session late), `sil-forecaster`, and
 * `render-sil-trends` → portfolio/SIL_TRENDS.json.
 *
 * The fix takes the LAST cell of the leading contiguous run of purely-numeric
 * cells, which is `Now` in the five-column shape and the only score in older
 * two-column entries — so historical rows keep parsing as they did. A `Note`
 * column containing digits cannot be captured, because the run stops at the first
 * non-numeric cell.
 */
function parseCategories(block) {
  const categories = {};
  const rowRe = /^\|\s*(?:\d+\s*\|\s*)?([A-Za-z][^|]+?)\s*\|([^\n]*)$/gm;
  for (const match of String(block).matchAll(rowRe)) {
    let label = match[1].trim().replace(/\s+/g, ' ');
    label = CATEGORY_ALIASES.get(label.toLowerCase()) ?? label.replace(/\s*\([^)]*\)\s*$/, '');
    // A score is frequently emphasised when it MOVED (`**82**`), which is exactly the
    // row that matters most — so emphasis must be stripped before the numeric test,
    // or the contiguous run stops at `Prev` and the fix silently changes nothing.
    const cells = match[2].split('|').map((c) => c.trim().replace(/[*`_]/g, '').trim());
    const run = [];
    for (const c of cells) {
      if (/^\d+$/.test(c)) run.push(Number(c));
      else if (run.length) break;            // contiguous run ended
      else if (c !== '') break;              // a non-numeric first cell: not a score row
    }
    if (run.length) categories[label] = run[run.length - 1];
  }
  return categories;
}

/** Parse every SIL session and sort greatest session first by default. */
export function parseSilSessions(markdown = '', { order = 'desc' } = {}) {
  const text = String(markdown);
  const headers = [...text.matchAll(HEADER_RE)];
  const revisionMap = revisionsBySession(text);
  const entries = headers.map((match, index) => {
    const sourceIndex = match.index ?? 0;
    const headerEnd = sourceIndex + match[0].length;
    const nextIndex = headers[index + 1]?.index ?? text.length;
    const header = match[0];
    const body = text.slice(headerEnd, nextIndex).replace(/^\r?\n/, '');
    const block = `${header}\n${body}`;
    const { total: baseTotal, max } = totalMatch(block);
    const date = header.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;
    const velocity = numberMatch(block, 'Velocity');
    // Effective score = the last addendum revision, else the base header total.
    // `baseTotal` and `revisions` stay exposed so the derivation is inspectable
    // rather than a number that silently differs from the one in the header.
    const session = Number(match[1]);
    const revisions = revisionMap.get(session) ?? [];
    const total = revisions.length ? revisions[revisions.length - 1].to : baseTotal;
    return {
      session,
      date,
      header,
      body,
      block,
      total,
      baseTotal,
      revisions,
      max,
      totalNormalized: total == null || max == null ? null : (max === 500 ? total * 2 : total),
      velocity,
      categories: parseCategories(body),
      sourceIndex,
    };
  }).filter((entry) => Number.isFinite(entry.session));

  const direction = order === 'asc' ? 1 : -1;
  return entries.sort((a, b) => direction * (a.session - b.session) || a.sourceIndex - b.sourceIndex);
}

export function latestSilEntry(markdown = '', { requireScore = false } = {}) {
  const entries = parseSilSessions(markdown);
  return (requireScore ? entries.find((entry) => entry.total != null) : entries[0]) ?? null;
}

export function latestSilSession(markdown = '') {
  return latestSilEntry(markdown)?.session ?? null;
}

export function selectSilPair(markdown = '', { requireScore = false } = {}) {
  const entries = parseSilSessions(markdown);
  const current = (requireScore ? entries.find((entry) => entry.total != null) : entries[0]) ?? null;
  const previous = current
    ? entries.find((entry) => entry.session < current.session && (!requireScore || entry.total != null)) ?? null
    : null;
  return { current, previous };
}

export default { parseSilSessions, latestSilEntry, latestSilSession, selectSilPair };
