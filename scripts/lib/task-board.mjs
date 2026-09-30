/**
 * task-board.mjs
 *
 * Shared TASK_BOARD parsing helpers used by startup, blocker, and queue flows.
 */

export function extractSection(markdown, heading) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const wanted = String(heading || '').trim();
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^##\s+(.+?)\s*$/);
    if (match?.[1].trim() === wanted) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Return every H2 section whose heading is exact or starts with a prefix. */
export function extractSectionsByPrefix(markdown, headingPrefix, { exact = false } = {}) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const wanted = String(headingPrefix || '').trim().toLowerCase();
  const sections = [];
  let current = null;
  for (let index = 0; index <= lines.length; index += 1) {
    const heading = index < lines.length ? lines[index].match(/^##\s+(.+?)\s*$/) : null;
    if (heading || index === lines.length) {
      if (current) {
        current.body = lines.slice(current.start, index).join('\n');
        sections.push(current);
        current = null;
      }
      if (heading) {
        const label = heading[1].trim();
        const normalized = label.toLowerCase();
        const matches = exact ? normalized === wanted : (normalized === wanted || normalized.startsWith(`${wanted} `));
        if (matches) current = { heading: label, line: index + 1, start: index + 1, body: '' };
      }
    }
  }
  return sections.map(({ start, ...section }) => section);
}

/** Parse unchecked checklist rows through one CRLF-safe TASK_BOARD grammar. */
export function parseOpenChecklistItems(markdown, { headingPrefix = null } = {}) {
  const sections = headingPrefix
    ? extractSectionsByPrefix(markdown, headingPrefix)
    : [{ heading: '(all)', line: 0, body: String(markdown || '') }];
  const items = [];
  for (const section of sections) {
    for (const [offset, line] of section.body.split(/\r?\n/).entries()) {
      if (!/^\s*-\s*\[\s\]\s+/.test(line) || /~~/.test(line)) continue;
      const text = line.replace(/^\s*-\s*\[\s\]\s+/, '').trim();
      items.push({ heading: section.heading, line: section.line + offset + 1, raw: line, text });
    }
  }
  return items;
}

/** Split a Markdown table row without treating an escaped pipe as a boundary. */
export function splitMarkdownTableRow(line) {
  const cells = [];
  let cell = '';
  const value = String(line || '');
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '|') {
      let slashCount = 0;
      for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashCount += 1;
      if (slashCount % 2 === 0) {
        cells.push(cell.trim());
        cell = '';
        continue;
      }
    }
    cell += char;
  }
  cells.push(cell.trim());
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells;
}

export function parseUnifiedItems(markdown) {
  const section = extractSection(markdown, 'Unified Genius List');
  if (!section) return [];

  const items = [];
  for (const line of section.split(/\r?\n/)) {
    if (!/^\|\s*[\d.]+\s*\|/.test(line)) continue;
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 6 || cells[0] === '#') continue;
    const [rank, tier, category, status, effort, ...itemCells] = cells;
    const rawItem = itemCells.join(' | ').trim();
    const titleMatch = rawItem.match(/\*\*(.+?)\*\*/);
    items.push({
      rank,
      rankNumber: parseFloat(rank),
      tier,
      category,
      status,
      effort,
      item: rawItem.replace(/\*\*/g, ''),
      rawItem,
      title: (titleMatch ? titleMatch[1] : rawItem).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(),
    });
  }

  return items;
}

/**
 * Parse every numeric task row in every historical/current Markdown table.
 * Unlike parseUnifiedItems(), this is intentionally not scoped to the first
 * Unified Genius section: ops task --id must find an old committed ID without
 * loading the whole board into an agent's context.
 */
export function parseTaskRows(markdown) {
  const rows = [];
  let section = '(root)';
  let lane = '(root)';
  const lines = String(markdown || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = line.match(/^#{2,6}\s+(.+?)\s*$/);
    if (heading) section = heading[1].trim();
    if (/^##\s/.test(line)) lane = section;
    if (!/^\|\s*\d+(?:\.\d+)?\s*\|/.test(line)) continue;
    const cells = splitMarkdownTableRow(line);
    if (cells.length < 6) continue;
    const [id, tier, category, status, effort, ...itemCells] = cells;
    const rawItem = itemCells.join(' | ').trim();
    const titleMatch = rawItem.match(/\*\*(.+?)\*\*/);
    rows.push({
      id,
      idNumber: Number(id),
      tier,
      category,
      status,
      effort,
      item: rawItem.replace(/\*\*/g, ''),
      rawItem,
      title: (titleMatch?.[1] || rawItem).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(),
      section,
      lane,
      line: index + 1,
      raw: line,
    });
  }
  return rows;
}

export function findTaskRowsById(markdown, id) {
  const key = String(id ?? '').trim();
  return parseTaskRows(markdown).filter((row) => row.id === key);
}

const ACTIVE_LANE = /^(?:Now\b|Next\b|Blocked\b|Human Action Required\b|Unified Genius List$)/i;
export const TERMINAL_TASK_STATUS = /^(?:done|shipped|closed|complete|completed|superseded|cancelled|canceled)(?:\b|[-:])/i;

/** Explicit state only: age and artifact presence never imply completion. */
export function isTerminalTask(row) {
  const body = String(row.rawItem ?? row.text ?? row.raw ?? '');
  return TERMINAL_TASK_STATUS.test(String(row.status || '').trim())
    || String(row.tier || '').includes('✅')
    || /^\s*-\s*\[x\]/i.test(row.raw || '')
    || /^(?:\[[^\]]*\]\s*)*~~.+~~\s*$/.test(body.trim())
    || /\*\*(?:DONE|SHIPPED|CLOSED|SUPERSEDED)\s+S\d+\b/i.test(body);
}

/** Every record remains addressable by line, including history and conflicts. */
export function parseTaskRecords(markdown) {
  const records = parseTaskRows(markdown).map(row => ({ ...row, kind: 'table', key: row.id, identity: `table:${row.id}` }));
  let section = '(root)', lane = '(root)';
  for (const [index, raw] of String(markdown || '').split(/\r?\n/).entries()) {
    const heading = raw.match(/^#{2,6}\s+(.+?)\s*$/);
    if (heading) section = heading[1].trim();
    if (/^##\s/.test(raw)) lane = section;
    if (!/^\s*-\s*\[(?:\s|x|SIL[^\]]*|S\d+\s*#\d+)\]/i.test(raw)) continue;
    const text = raw.replace(/^\s*-\s*(?:\[(?:\s|x)\]\s*)?/i, '').trim();
    const identityText = text.replace(/^[^\p{L}\p{N}\[]*/u, '');
    const tag = identityText.match(/^(?:\[SIL[^\]]*\][^\p{L}\p{N}\[]*)?\[S(\d+)\s*#(\d+)\]/iu);
    const key = tag ? `S${Number(tag[1])}#${Number(tag[2])}` : `L${index + 1}`;
    const title = (text.match(/\*\*(.+?)\*\*/)?.[1] || text).replace(/[*~`]/g, '').replace(/\s+/g, ' ').trim();
    const header = text.match(/\*\*(.+?)\*\*/)?.[1] || text.split('—')[0];
    const status = /^\s*-\s*\[x\]/i.test(raw) ? 'done'
      : /\[FOUNDER(?: ACTION| DECISION)?\]/i.test(header) || /^Human Action Required\b/i.test(lane) ? 'human-blocked'
      : /\[BLOCKER\]/i.test(header) || /^Blocked\b/i.test(lane) ? 'blocked' : 'unblocked';
    records.push({ kind: 'bullet', key, identity: `bullet:${/^\[SIL/i.test(identityText) ? 'sil:' : ''}${key}`, title, text, rawItem: text, raw, status, section, lane, line: index + 1, tier: /^Now\b/i.test(lane) ? '🔥' : '⚡', category: 'task', effort: '' });
  }
  return records.sort((a, b) => a.line - b.line).map(row => ({ ...row, activeLane: ACTIVE_LANE.test(row.lane), terminal: isTerminalTask(row) }));
}

/** A terminal identity wins over stale open copies. Reopening is explicit and ordered. */
export function reconcileTaskRecords(markdown) {
  const records = parseTaskRecords(markdown);
  const groups = new Map();
  for (const row of records) {
    if (!groups.has(row.identity)) groups.set(row.identity, []);
    groups.get(row.identity).push(row);
  }
  const active = [], suppressed = [];
  for (const peers of groups.values()) {
    const terminals = peers.filter(row => row.terminal);
    const candidates = peers.filter(row => row.activeLane && !row.terminal);
    const valid = candidates.filter(row => terminals.every(closed => {
      const reopened = `${row.status} ${row.rawItem}`.match(/\breopened\s+S(\d+)\b/i);
      const closedSession = `${closed.status} ${closed.rawItem}`.match(/\b(?:done|closed|shipped|superseded)\s+S(\d+)\b/i)
        || closed.lane.match(/\bS(\d+)\b/);
      return reopened && closedSession && Number(reopened[1]) > Number(closedSession[1]);
    }));
    if (valid.length) active.push(valid[0]);
    for (const row of candidates) {
      if (row !== valid[0]) suppressed.push({ identity: row.identity, line: row.line, reason: valid.includes(row) ? 'duplicate' : 'terminal-identity', evidenceLines: terminals.map(p => p.line) });
    }
  }
  return { records, active: active.sort((a, b) => a.line - b.line), suppressed };
}

/**
 * Parse the `## Human Action Required` rows.
 *
 * S337 — `ageSessions` came from ONE phrasing, `(N sessions)`, which nothing writes.
 * Measured live, all four rows returned `ageSessions: null`, so every consumer that
 * coerced it (`?? 0`, `|| 0`) scored and ranked the founder's blockers as brand new:
 * the age dimension of the human-action pressure model contributed exactly 0 for
 * 100% of rows, and the control tower's "top 5 oldest" compared every key equal.
 *
 * The age was already recorded elsewhere. `portfolio/HUMAN_ACTION_AGES.json` is a
 * first-seen ledger built for this exact symptom ("items that had no ~N sessions
 * notation, so aged-item escalation couldn't fire") — and this parser, which feeds
 * the pressure model and the control tower, never read it. A correct writer with
 * readers that ignore it (S321).
 *
 * So `ageDays` is resolved from that ledger when it is available. It stays null when
 * it is not, and `ageSessions` stays null unless a row states it — the ledger records
 * `session: null` for every row (no caller passes `currentSession`), so converting
 * days into sessions here would be inventing a number, not reading one.
 *
 * @param {string} markdown
 * @param {{firstSeenLedger?: Record<string, {firstSeen?: string}>, nowMs?: number}} [opts]
 */
export function parseHumanItems(markdown, opts = {}) {
  const section = extractSection(markdown, 'Human Action Required');
  if (!section) return [];
  const ledger = opts.firstSeenLedger && typeof opts.firstSeenLedger === 'object'
    ? opts.firstSeenLedger
    : null;
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();

  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^- \[ \] \*\*(.*?)\*\* — (.*)$/))
    .filter(Boolean)
    .map((parts) => {
      const title = parts[1].trim();
      const description = parts[2].trim();
      const ageMatch =
        description.match(/\((~?\d+)\s+sessions?\)/i) ||
        description.match(/\((\d+)\s+sessions?\s+old\)/i);
      const ageSessions = ageMatch ? parseInt(ageMatch[1].replace('~', ''), 10) : null;
      const firstSeen = ledger ? firstSeenFor(ledger, title) : null;
      const ageDays = firstSeen ? daysBetween(firstSeen, nowMs) : null;
      return {
        title,
        description,
        raw: `**${title}** — ${description}`,
        ageSessions,
        firstSeen,
        ageDays,
      };
    });
}

export function extractCurrentSessionIntent(markdown) {
  const match = String(markdown || '').match(/## Current Session Intent: Session \d+\n([\s\S]*?)(?=\n## |\n---|$)/);
  if (!match) return '';
  return match[1].trim().replace(/\r?\n+/g, ' ');
}

/**
 * Look up a row's first-seen date. The ledger keys are the row titles with markdown
 * stripped, and that stripping differs slightly between the two parsers that have
 * existed (one splits on the em-dash BEFORE removing `**`), so an exact match is
 * tried first and a normalised match second. A miss returns null — an unknown age,
 * never a zero.
 */
function firstSeenFor(ledger, title) {
  const direct = ledger[title]?.firstSeen;
  if (direct) return direct;
  const norm = (s) => String(s).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const want = norm(title);
  for (const [key, value] of Object.entries(ledger)) {
    if (!value?.firstSeen) continue;
    const k = norm(key);
    if (k === want || k.startsWith(want) || want.startsWith(k)) return value.firstSeen;
  }
  return null;
}

function daysBetween(isoDate, nowMs) {
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 86400000));
}
