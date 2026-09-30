import crypto from 'node:crypto';
import { parseHandoffBlocks } from './handoff-blocks.mjs';

// Extract source text, never infer completion or hide omitted sections. The
// source hash makes cached extracts valid until their input actually changes.
export function handoffDigest(source, { maxChars = 6000 } = {}) {
  const text = String(source).replace(/\r\n/g, '\n');
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  const lines = text.split('\n');
  const structural = parseHandoffBlocks(text);
  const sections = lines.flatMap((line, i) => /^(?:#{1,3}\s|\*\*Session\s)/.test(line)
    ? [{ line: i + 1, heading: line }] : []);
  const prefix = `<!-- generated-by: scripts/compact-handoff.mjs deterministic-v1 -->\n<!-- source-hash: ${hash} -->\n\n# LATEST_HANDOFF (source extract)\n\n`;
  if (prefix.length + text.length <= maxChars) return { hash, digest: prefix + text, omitted: false };
  const index = sections.map(s => `- L${s.line}: ${s.heading.replace(/^#+\s*/, '')}`).join('\n');
  const footer = `\n\n## Source lookup\n\nExtract is incomplete. Read context/LATEST_HANDOFF.md at the indicated lines before acting on omitted work or approvals. Full file: ${lines.length} lines; ${structural.length} typed handoff blocks.\n${index}\n`;
  // Reserve room for a useful lookup even if a malformed input has thousands of headings.
  const indexBudget = Math.min(Math.floor(maxChars / 2), footer.length);
  const lookup = footer.length <= indexBudget ? footer : footer.slice(0, indexBudget - 80).trimEnd() + '\nAdditional headings omitted; read the full source.\n';
  const budget = Math.max(0, maxChars - prefix.length - lookup.length - 2);
  const candidate = text.slice(0, budget);
  const excerpt = candidate.slice(0, Math.max(0, candidate.lastIndexOf('\n')));
  return { hash, digest: prefix + excerpt + lookup, omitted: true };
}
