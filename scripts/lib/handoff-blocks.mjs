const HEADER_RE = /^##\s+(Where We Left Off|Impact Summary)\s*\((?:(?:Session)\s+)?S?(\d+(?:\.\d+)?)(?:\s*(?:—|-)\s*|\s+)?([^)]*)\)\s*$/gim;

function kindFor(label) {
  return label.toLowerCase().startsWith('impact') ? 'impact-summary' : 'where-we-left-off';
}

export function parseHandoffBlocks(text = '') {
  const source = String(text).replace(/\r\n/g, '\n');
  const headers = [...source.matchAll(HEADER_RE)].map((match) => ({
    kind: kindFor(match[1]),
    session: Number(match[2]),
    sessionLabel: match[2],
    qualifier: String(match[3] || '').trim().replace(/^(?:—|-)\s*/, ''),
    heading: match[0],
    start: match.index,
    contentStart: match.index + match[0].length,
  }));
  return headers.map((header, index) => {
    const next = headers[index + 1];
    const rawEnd = next ? next.start : source.length;
    const body = source.slice(header.contentStart, rawEnd).replace(/^\n/, '').replace(/\n---\s*\n*$/, '\n');
    return { ...header, end: rawEnd, body, raw: source.slice(header.start, rawEnd) };
  });
}

export function latestHandoffBlock(text, { kind = 'where-we-left-off', session = null } = {}) {
  const matches = parseHandoffBlocks(text).filter((block) => block.kind === kind && (session == null || block.session === Number(session)));
  return matches.sort((a, b) => b.session - a.session || a.start - b.start)[0] || null;
}

export function latestStructuralSession(text = '') {
  const sessions = parseHandoffBlocks(text).map((block) => block.session).filter(Number.isFinite);
  return sessions.length ? Math.max(...sessions) : null;
}

/**
 * The session THIS handoff documents, read from its top-of-file identity.
 *
 * S334 [audit #6]. LATEST_HANDOFF.md has carried its identity in the title and the
 * metadata line under it for many sessions:
 *
 *     # Latest Handoff — Session 333 → 334
 *     **Session 333** · 2026-09-09 · studio-ops · infrastructure · direct-to-main
 *
 * Nothing recognised either form. `render-impact-summary` looked for a `Last updated:
 * (Session N)` header the file no longer has, then fell back to the `## Where We Left
 * Off / ## Impact Summary` block scan — and the live file has no such block either, so
 * it exited 1 with "Could not resolve current session" on every run. That is the same
 * defect its own header comment records being fixed once before at S193: a reader whose
 * recognised formats stopped including the one the writer produces.
 *
 * `**Session N**` is preferred over the title arrow because it is unambiguous — the
 * arrow's left side is this session and its right side is the NEXT one, and reading the
 * wrong end would mislabel every rendered surface by one. Returns null when neither form
 * is present; an unresolvable session is never guessed at.
 */
export function handoffHeaderSession(text = '') {
  const source = String(text).replace(/\r\n/g, '\n');
  // The metadata line: `**Session 333** · 2026-09-09 · …`
  const bold = source.match(/^\*\*Session\s+(\d+)\*\*/m);
  if (bold) return Number(bold[1]);
  // The title: `# Latest Handoff — Session 333 → 334`. Take the LEFT side: the session
  // being handed off FROM is the one this document reports on.
  const title = source.match(/^#\s+.*?\bSession\s+(\d+)\s*(?:→|->|—>)\s*\d+/m);
  if (title) return Number(title[1]);
  // A title naming a single session, e.g. `# Latest Handoff — Session 333`.
  const single = source.match(/^#\s+.*?\bSession\s+(\d+)\s*$/m);
  if (single) return Number(single[1]);
  return null;
}
