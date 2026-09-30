// medium-quality-gates.mjs — per-medium quality gates for /implement (audit item #17 · S125)
//
// Each gate fn returns { pass: bool, reason: string, fixHint?: string }.
// Called by implement-driver / sprint-runner after each item completes.
// Block closeout when any returns pass=false unless --skip-gate (logged to DECISIONS).

import { execSync } from './safe-spawn.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { projectMedium } from './media-profile.mjs';
import { runMediaGate } from './media-quality-gate.mjs';

function git(cmd) { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }); } catch { return ''; } }

const GATES = {
  media: runMediaGate,
  game: (item, ctx) => {
    const touched = git('diff --name-only HEAD~1..HEAD').split('\n');
    const loopTouched = touched.some(f => /game[/\\]loop|core[-_]?loop|src[/\\]loop/.test(f));
    if (!loopTouched) return { pass: true, reason: 'no core-loop files touched' };
    const hasPlaytestNote = git('log -1 --format=%B').match(/playtest|loop-tightness|retention/i);
    if (hasPlaytestNote) return { pass: true, reason: 'playtest/loop-tightness note found' };
    return { pass: false, reason: 'core-loop touched without playtest hook OR loop-tightness note', fixHint: 'Append "playtest:" or "loop-tightness:" note to commit body, or add hook in test/' };
  },

  novel: (item, ctx) => {
    const touched = git('diff --name-only HEAD~1..HEAD').split('\n');
    const chapterTouched = touched.some(f => /chapter|scene|canon|bible|world/i.test(f));
    if (!chapterTouched) return { pass: true, reason: 'no chapter/canon files touched' };
    // Check continuity-check ran in this session (heuristic: file in .cache or recent log)
    try {
      const log = git('log --since="6 hours ago" --grep="continuity\\|novel-continuity-check" --oneline');
      if (log.trim()) return { pass: true, reason: 'continuity-check evidence found' };
    } catch {}
    return { pass: false, reason: 'chapter/canon edit without novel-continuity-check run', fixHint: 'Run /novel-continuity-check before marking item done' };
  },

  app: (item, ctx) => {
    const touched = git('diff --name-only HEAD~1..HEAD').split('\n').filter(Boolean);
    const codeFiles = touched.filter(f => /\.(ts|tsx|js|jsx|mjs|py|go|rs|java)$/.test(f) && !/test|spec|__tests__/.test(f));
    const testFiles = touched.filter(f => /test|spec|__tests__/.test(f));
    if (codeFiles.length === 0) return { pass: true, reason: 'no new code paths' };
    if (testFiles.length === 0) return { pass: false, reason: `${codeFiles.length} code file(s) without test additions`, fixHint: 'Add ≥1 test (unit or e2e) for new code path before marking done' };
    return { pass: true, reason: `${testFiles.length} test file(s) accompany ${codeFiles.length} code file(s)` };
  },

  tool: (item, ctx) => {
    // Same as app — tools need test coverage for new code paths
    return GATES.app(item, ctx);
  },

  infrastructure: (item, ctx) => {
    const msg = git('log -1 --format=%B');
    const hasRollback = /rollback|revert|undo/i.test(msg);
    // Check DECISIONS.md updated in this commit
    const touched = git('diff --name-only HEAD~1..HEAD').split('\n');
    const decisionsUpdated = touched.some(f => /context\/DECISIONS\.md/.test(f));
    if (hasRollback || decisionsUpdated) return { pass: true, reason: hasRollback ? 'rollback noted in commit' : 'DECISIONS.md updated' };
    return { pass: false, reason: 'infra change without rollback note in commit OR DECISIONS.md update', fixHint: 'Add "rollback: <how>" line to commit body or append decision entry' };
  },

  'internal-ops': (item, ctx) => GATES.infrastructure(item, ctx),
  'internal-tool': (item, ctx) => GATES.infrastructure(item, ctx),

  platform: (item, ctx) => {
    // Multi-tenant changes need tenant-isolation test
    const touched = git('diff --name-only HEAD~1..HEAD').split('\n');
    const multiTenant = touched.some(f => /tenant|workspace|org|multi[-_]?tenant/i.test(f));
    if (!multiTenant) return { pass: true, reason: 'no multi-tenant code touched' };
    const tenantTest = touched.some(f => /(tenant|isolation).*\.(test|spec)\./i.test(f));
    if (tenantTest) return { pass: true, reason: 'tenant-isolation test present' };
    return { pass: false, reason: 'multi-tenant code without tenant-isolation test', fixHint: 'Add isolation test covering cross-tenant access denial' };
  },

  dashboard: (item, ctx) => {
    const touched = git('diff --name-only HEAD~1..HEAD').split('\n');
    const panelAdded = touched.some(f => /chart|panel|widget|graph/i.test(f));
    if (!panelAdded) return { pass: true, reason: 'no chart/panel changes' };
    // Best-effort: scan for empty/loading/error state mentions
    try {
      const diff = git('diff HEAD~1..HEAD');
      const states = ['empty', 'loading', 'error'].filter(s => new RegExp(`${s}[-_]?state|is${s}`, 'i').test(diff));
      if (states.length >= 2) return { pass: true, reason: `state coverage: ${states.join(', ')}` };
    } catch {}
    return { pass: false, reason: 'chart/panel without empty+loading+error state coverage', fixHint: 'Add at least 2 of: empty-state · loading-state · error-state' };
  },

  website: (item, ctx) => {
    // Best-effort: check for Lighthouse note or perf note in commit
    const msg = git('log -1 --format=%B');
    if (/lighthouse|perf|cwv|lcp|cls|inp/i.test(msg)) return { pass: true, reason: 'perf note in commit' };
    return { pass: true, reason: 'advisory — verify Lighthouse Performance ≥90 mobile post-deploy' };
  },
};

export function runMediumGate(medium, item, ctx = {}) {
  const gate = GATES[projectMedium({ medium })];
  if (!gate) return { pass: true, reason: 'no gate registered for medium', medium };
  const result = gate(item, ctx);
  return { ...result, medium };
}

export function listGates() { return Object.keys(GATES); }

const __isMain = (() => {
  try {
    const u = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '').replace(/\\/g, '/');
    const a = (process.argv[1] || '').replace(/\\/g, '/');
    return u === a || u.endsWith(a) || a.endsWith(u);
  } catch { return false; }
})();
if (__isMain) {
  const medium = process.argv[2] || 'infrastructure';
  const projectDir = process.argv.find(arg => arg.startsWith('--project='))?.slice(10) || process.cwd();
  const itemPath = process.argv.find(arg => arg.startsWith('--item='))?.slice(7);
  let item = { slug: 'cli-test' };
  try {
    if (itemPath) {
      const file = path.resolve(projectDir, itemPath);
      if (fs.statSync(file).size > 1024 * 1024) throw new Error('Item JSON exceeds 1MiB');
      item = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    }
  } catch {
    console.log(JSON.stringify({ pass: false, state: 'unmeasured', reason: 'Item JSON missing or invalid', medium }));
    process.exit(1);
  }
  const r = runMediumGate(medium, item, { projectDir });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.pass ? 0 : 1);
}
