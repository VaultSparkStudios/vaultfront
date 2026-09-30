#!/usr/bin/env node
/**
 * compact-handoff.mjs — LATEST_HANDOFF compactor + trimmer (v3.2)
 *
 * Two modes:
 *
 * DEFAULT: deterministic source extract with a hash and omitted-section lookup.
 *   No credentials or API calls. Cache stays valid while the source is unchanged.
 * --summarize --approved-max-usd=N: optional paid summary under an explicitly
 *   authorized cost ceiling. The deterministic source lookup is always retained.
 *
 * --trim: Archive all sessions beyond the newest 2 to `context/HANDOFF_ARCHIVE.md`.
 *   Keeps LATEST_HANDOFF.md at ≤2 sessions (~5-8K tokens max).
 *   Run automatically at closeout to prevent unbounded file growth.
 *   Idempotent — re-running when already ≤2 sessions is a no-op.
 *
 * Usage:
 *   node scripts/compact-handoff.mjs           # digest cache (default)
 *   node scripts/compact-handoff.mjs --force   # force re-digest
 *   node scripts/compact-handoff.mjs --trim    # archive old sessions
 *   node scripts/compact-handoff.mjs --trim --dry-run  # preview only
 */

import fs from 'fs';
import https from 'https';
import path from 'path';
import crypto from 'crypto';
import { MODELS, callClaude, withLongCache, priceForModel } from './lib/model-router.mjs';
import { getSecret } from './lib/secrets.mjs';
import { archiveBeforeMutate } from './lib/archive-then-compact.mjs';
import { handoffDigest } from './lib/handoff-digest.mjs';

const ROOT = process.cwd();
const HANDOFF = path.join(ROOT, 'context', 'LATEST_HANDOFF.md');
const CACHE   = path.join(ROOT, '.ops-cache', 'handoff-digest.json');
const OUT     = path.join(ROOT, 'context', 'LATEST_HANDOFF.compact.md');

const force   = process.argv.includes('--force');
const trim    = process.argv.includes('--trim');
const dryRun  = process.argv.includes('--dry-run');

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

// ── TRIM MODE ────────────────────────────────────────────────────────────────
if (trim) {
  const ARCHIVE = path.join(ROOT, 'context', 'HANDOFF_ARCHIVE.md');
  const raw = readText(HANDOFF);
  if (!raw) { console.error('No LATEST_HANDOFF.md found.'); process.exit(1); }

  // Split on "## Where We Left Off" session boundaries (robust to \r\n + \n)
  const normalized = raw.replace(/\r\n/g, '\n');
  const sections = normalized.split(/\n(?=## Where We Left Off)/);
  const header   = sections[0].trimStart().startsWith('## Where We Left Off') ? '' : sections.shift();
  const sessions = sections; // each starts with "## Where We Left Off ..."

  const KEEP = 2;
  if (sessions.length <= KEEP) {
    console.log(`= LATEST_HANDOFF.md already has ${sessions.length} session(s) — no trim needed.`);
    process.exit(0);
  }

  const toKeep    = sessions.slice(0, KEEP);
  const toArchive = sessions.slice(KEEP);

  console.log(`✂ Trimming LATEST_HANDOFF.md: keeping ${KEEP} sessions, archiving ${toArchive.length}`);
  toArchive.forEach(s => {
    const firstLine = s.split('\n')[0].replace('## Where We Left Off', '').trim();
    console.log(`  → archive: ${firstLine}`);
  });

  if (!dryRun) {
    archiveBeforeMutate({
      sourcePath: HANDOFF,
      content: raw,
      label: 'handoff-trim',
      suffix: '.full.md',
    });
    // Append archived sessions to HANDOFF_ARCHIVE.md
    const archiveHeader = `\n\n---\n<!-- archived: ${new Date().toISOString().slice(0, 10)} -->\n\n`;
    fs.appendFileSync(ARCHIVE, archiveHeader + toArchive.join(''));
    // Rewrite LATEST_HANDOFF with just the keeper sections
    fs.writeFileSync(HANDOFF, header + toKeep.join(''));
    console.log(`✓ LATEST_HANDOFF.md trimmed (${toKeep.length} sessions kept)`);
    console.log(`✓ ${toArchive.length} session(s) appended to context/HANDOFF_ARCHIVE.md`);
  } else {
    console.log(`(dry-run) would rewrite LATEST_HANDOFF.md + append ${toArchive.length} to HANDOFF_ARCHIVE.md`);
  }
  process.exit(0);
}

// ── DIGEST MODE (default) ─────────────────────────────────────────────────────
const handoff = readText(HANDOFF);
if (!handoff) { console.error('No LATEST_HANDOFF.md found.'); process.exit(1); }

const hash = crypto.createHash('sha256').update(handoff).digest('hex');
let cached = null;
try { cached = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}

const summarize = process.argv.includes('--summarize');
const mode = summarize ? 'paid-summary-v1' : 'deterministic-v1';
const stillFresh = cached && cached.hash === hash && cached.mode === mode;
if (stillFresh && !force) {
  fs.writeFileSync(OUT, cached.digest);
  console.log(`✓ Compact handoff (cached) → context/LATEST_HANDOFF.compact.md  (${cached.digest.length} chars)`);
  process.exit(0);
}

const extract = handoffDigest(handoff);
if (!summarize) {
  fs.writeFileSync(OUT, extract.digest);
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify({ hash, mode, digest: extract.digest, ts: Date.now() }, null, 2));
  console.log(`✓ Deterministic handoff → context/LATEST_HANDOFF.compact.md (${extract.digest.length} chars; source lookup ${extract.omitted ? 'required' : 'complete'}; no API call)`);
  process.exit(0);
}

const approvedCap = Number(process.argv.find(a => a.startsWith('--approved-max-usd='))?.split('=')[1]);
const price = priceForModel(MODELS.haiku);
// UTF-8 bytes bound text tokens conservatively; add room for system/message envelopes.
const estimatedUpperCost = ((Buffer.byteLength(handoff.slice(0, 40000)) + 4096) * Math.max(price.input, price.cacheWrite) + 1200 * price.output) / 1_000_000;
if (!Number.isFinite(approvedCap) || approvedCap <= 0 || estimatedUpperCost > approvedCap) {
  console.error(`Paid summarization requires an explicitly authorized --approved-max-usd ceiling at least ${estimatedUpperCost.toFixed(6)}. Default extraction uses no API.`);
  process.exit(2);
}
const apiKey = getSecret('ANTHROPIC_API_KEY', 'claude.api');
if (!apiKey) { console.error('claude.api credential unavailable; use default deterministic extraction.'); process.exit(2); }

const systemStable = withLongCache({
  type: 'text',
  text: `You are a handoff compressor. Given a LATEST_HANDOFF.md, produce a ≤500-token summary that a new agent can read cold. Preserve: session number, what shipped, current intent, top 3 Now-bucket items, top 3 blockers, human-blocked items with age. Drop: narrative, historical sessions, praise. Use terse bulleted sections with headers. No emojis, no markdown bold. End with a one-line next-session pointer.`,
});

const resp = await callClaude({
  apiKey,
  model: MODELS.haiku,
  maxTokens: 1200,
  logAs: 'compact-handoff',
  turnClassify: false,
  system: [systemStable],
  messages: [{ role: 'user', content: handoff.slice(0, 40000) }],
}, https);

const digest = resp.content?.map(c => c.text || '').join('') || '';
const out = `<!-- generated-by: scripts/compact-handoff.mjs paid-summary-v1 -->\n<!-- source-hash: ${hash} -->\n\n# LATEST_HANDOFF (model summary; verify against source)\n\n${digest}\n\n${extract.digest}`;

fs.writeFileSync(OUT, out);
fs.mkdirSync(path.dirname(CACHE), { recursive: true });
fs.writeFileSync(CACHE, JSON.stringify({ hash, mode, digest: out, ts: Date.now() }, null, 2));

console.log(`✓ Compact handoff → context/LATEST_HANDOFF.compact.md  (${out.length} chars, cached by source hash)`);
console.log(`  Tokens: input ${resp.usage?.input_tokens || 0}  output ${resp.usage?.output_tokens || 0}  cache_read ${resp.usage?.cache_read_input_tokens || 0}`);
