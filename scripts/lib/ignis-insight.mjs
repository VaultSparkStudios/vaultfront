#!/usr/bin/env node
// IGNIS insight summariser.
// Parses portfolio/IGNIS_CORE.md + portfolio/IGNIS_PATTERNS.md into a
// compact object suitable for embedding in the startup brief and closeout
// status board. Kept deterministic (no model calls) so it renders offline.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(__dirname, '..', '..');

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

function extractSection(content, heading) {
  const parts = content.split(/^## /m);
  const match = parts.find(p => p.startsWith(heading));
  if (!match) return '';
  const nl = match.indexOf('\n');
  return nl === -1 ? '' : match.slice(nl + 1);
}

function firstSentence(s) {
  if (!s) return '';
  const m = s.replace(/\s+/g, ' ').trim().match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : s.slice(0, 180)).trim();
}

export function loadIgnisInsight(options = {}) {
  const root = options.studioRoot || STUDIO_ROOT;
  const corePath = path.join(root, 'portfolio', 'IGNIS_CORE.md');
  const patternsPath = path.join(root, 'portfolio', 'IGNIS_PATTERNS.md');
  const core = readText(corePath);
  if (!core) return { present: false };

  const statusBlock = extractSection(core, 'Rolling Status Header');
  const summaryBlock = extractSection(core, 'Portfolio Intelligence Summary');
  const coverageBlock = extractSection(core, 'Coverage Signals');
  const actionsBlock = extractSection(core, 'Recommended Actions');
  const generated = core.match(/Last synthesised:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

  const phase = statusBlock.match(/IGNIS Phase:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  const avgIq = statusBlock.match(/Average tracked IQ:\s*([^(\n]+)/)?.[1]?.trim() ?? null;
  const topProject = statusBlock.match(/Top tracked project:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  const topRisk = statusBlock.match(/Highest current founder-facing risk:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  const truthMix = statusBlock.match(/Truth status mix:\s*([^\n]+)/)?.[1]?.trim() ?? null;
  const coverage = statusBlock.match(/Tracked IGNIS coverage:\s*([^\n]+)/)?.[1]?.trim() ?? null;

  // Top recommendation: first numbered line in Recommended Actions.
  const firstAction = actionsBlock.match(/^\s*1\.\s+(.+)$/m)?.[1]?.trim() ?? null;
  const summaryLead = firstSentence(summaryBlock);

  const patterns = readText(patternsPath);
  const patternHeadline = patterns.match(/^##\s+([^\n]+)/m)?.[1]?.trim() ?? null;

  const daysSinceSynth = generated
    ? Math.max(0, Math.floor((Date.now() - new Date(generated).getTime()) / 86400000))
    : null;

  return {
    present: true,
    generated,
    daysSinceSynth,
    phase,
    avgIq,
    topProject,
    topRisk,
    truthMix,
    coverage,
    firstAction,
    summaryLead,
    patternHeadline,
  };
}

// CLI
if (process.argv[1]?.endsWith('ignis-insight.mjs')) {
  const out = loadIgnisInsight();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
  } else if (!out.present) {
    console.log('IGNIS insight unavailable — portfolio/IGNIS_CORE.md missing.');
  } else {
    console.log(`IGNIS Insight · synth ${out.generated} (${out.daysSinceSynth}d)`);
    if (out.phase) console.log(`  Phase:      ${out.phase}`);
    if (out.avgIq) console.log(`  Avg IQ:     ${out.avgIq}`);
    if (out.coverage) console.log(`  Coverage:   ${out.coverage}`);
    if (out.topProject) console.log(`  Top:        ${out.topProject}`);
    if (out.topRisk) console.log(`  Top risk:   ${out.topRisk}`);
    if (out.truthMix) console.log(`  Truth mix:  ${out.truthMix}`);
    if (out.firstAction) console.log(`  Action:     ${out.firstAction}`);
    if (out.summaryLead) console.log(`  Summary:    ${out.summaryLead}`);
  }
}
