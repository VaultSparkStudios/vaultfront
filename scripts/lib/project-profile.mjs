// project-profile.mjs — single derived "personality lens" for all 4 goal-loop skills
// Audit item #11 (S125). Eliminates redundant context-file reads across /start /audit /implement /closeout.
// Cached at .cache/project-profile.json with 30-min TTL.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from './safe-spawn.mjs';
import { projectMedium } from './media-profile.mjs';

const TTL_MS = 30 * 60 * 1000;
const CACHE_PATH = '.cache/project-profile.json';

function safeRead(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }
function safeJSON(p) { try { return JSON.parse(safeRead(p) || 'null'); } catch { return null; } }

function detectSlug() {
  try {
    const url = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
    const m = url.match(/[/:]([^/]+?)(\.git)?$/);
    return m ? m[1] : 'unknown';
  } catch { return 'unknown'; }
}

function loadRegistryEntry(slug) {
  // Look in current repo (if studio-ops) or sibling studio-ops
  const candidates = [
    'portfolio/PROJECT_REGISTRY.json',
    '../vaultspark-studio-ops/portfolio/PROJECT_REGISTRY.json',
  ];
  for (const p of candidates) {
    const r = safeJSON(p);
    if (!r) continue;
    const list = r.projects || r;
    const hit = list.find(x => x.slug === slug || x.name === slug || (x.repo || '').endsWith('/' + slug) || (x.repo || '').endsWith('/' + slug + '.git'));
    if (hit) return hit;
  }
  return null;
}

function lastDecisions(n = 3) {
  const md = safeRead('context/DECISIONS.md');
  if (!md) return [];
  const blocks = md.split(/^##\s+/m).filter(b => /^[A-Z0-9-]/.test(b)).slice(0, n);
  return blocks.map(b => b.split('\n')[0].slice(0, 120));
}

function soulNonNegs() {
  const md = safeRead('context/SOUL.md');
  if (!md) return [];
  const m = md.match(/non-negotiable[^]*?(?=##|$)/i);
  if (!m) return [];
  return (m[0].match(/^\s*[-*]\s+(.+)$/gm) || []).slice(0, 3).map(s => s.replace(/^\s*[-*]\s+/, '').slice(0, 100));
}

function openBlockers() {
  const md = safeRead('context/TASK_BOARD.md');
  return (md.match(/\[BLOCKER\]/g) || []).length;
}

function lastActivityHours() {
  try {
    const ts = execSync('git log -1 --format=%ct', { encoding: 'utf8' }).trim();
    return Math.round((Date.now() / 1000 - Number(ts)) / 3600);
  } catch { return null; }
}

function ignisTopAxes() {
  // Best-effort: read IGNIS scoring sidecar if available
  const ig = safeJSON('portfolio/IGNIS_CORE.json') || safeJSON('ignis/state/scores.json');
  if (!ig) return [];
  const axes = ig.topAxes || ig.axes || {};
  return Object.entries(axes).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 3).map(([k]) => k);
}

export function getProjectProfile({ force = false } = {}) {
  if (!force && existsSync(CACHE_PATH)) {
    try {
      const st = statSync(CACHE_PATH);
      if (Date.now() - st.mtimeMs < TTL_MS) {
        const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
        if (cached.profileSchemaVersion === 2) return cached;
      }
    } catch { /* fall through */ }
  }
  const slug = detectSlug();
  const reg = loadRegistryEntry(slug) || safeJSON('context/PROJECT_STATUS.json') || {};
  const profile = {
    profileSchemaVersion: 2,
    slug,
    medium: projectMedium(reg),
    stage: reg.developmentPhase || reg.lifecycle || 'unknown',
    vaultStatus: reg.vaultStatus || 'UNKNOWN',
    archetype: reg.archetype || reg.stackArchetype || null,
    audience: reg.audience || 'unknown',
    health: reg.health || 'unknown',
    soulNonNegs: soulNonNegs(),
    lastDecisions: lastDecisions(),
    ignisTopAxes: ignisTopAxes(),
    openBlockers: openBlockers(),
    lastActivityHours: lastActivityHours(),
    brandingRequired: !!reg.brandingRequired,
    stripeReady: !!reg.stripeReady,
    generatedAt: new Date().toISOString(),
    ttlMs: TTL_MS,
  };
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(profile, null, 2));
  } catch { /* cache write best-effort */ }
  return profile;
}

// CLI: `node scripts/lib/project-profile.mjs [--force] [--json]`
const __isMain = (() => {
  try {
    const u = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '').replace(/\\/g, '/');
    const a = (process.argv[1] || '').replace(/\\/g, '/');
    return u === a || u.endsWith(a) || a.endsWith(u);
  } catch { return false; }
})();
if (__isMain) {
  const force = process.argv.includes('--force');
  const p = getProjectProfile({ force });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(p, null, 2));
  } else {
    console.log(`Profile · ${p.slug} · ${p.medium} · ${p.stage} · ${p.vaultStatus}`);
    console.log(`  Blockers: ${p.openBlockers} · Last activity: ${p.lastActivityHours}h · IGNIS axes: ${p.ignisTopAxes.join(', ') || 'n/a'}`);
    console.log(`  Decisions: ${p.lastDecisions.length} recent · Soul non-negs: ${p.soulNonNegs.length}`);
  }
}
