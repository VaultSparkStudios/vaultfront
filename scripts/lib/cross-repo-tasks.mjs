#!/usr/bin/env node
// Cross-repo TASK_BOARD aggregator.
// Reads context/TASK_BOARD.md for every project in portfolio/PROJECT_REGISTRY.json,
// parses the Unified Genius List table (+ legacy Now/Next buckets as fallback),
// and returns per-project + aggregate counts so the startup/closeout briefs
// can surface a stackable picture of everything open across the studio.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { reconcileTaskRecords, TERMINAL_TASK_STATUS } from './task-board.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(__dirname, '..', '..');

function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }


function tierFromCell(cell) {
  if (cell.includes('🔥')) return 'critical';
  if (cell.includes('⚡')) return 'high';
  if (cell.includes('💡')) return 'medium';
  if (cell.includes('🔧')) return 'low';
  return 'medium';
}

export function parseTaskBoard(content) {
  const { active } = reconcileTaskRecords(content);
  return active.map((row, index) => ({
    rank: row.idNumber ?? index + 1, key: row.key, identity: row.identity,
    tier: tierFromCell(row.tier), cat: (row.category || '').toLowerCase(),
    status: (row.status || '').toLowerCase(), effort: row.effort,
    title: row.title.slice(0, 120),
    source: row.kind === 'table' ? 'unified' : /^Now\b/i.test(row.lane) ? 'legacy-now' : 'legacy-next',
    line: row.line, section: row.section, done: false,
  }));
}

/**
 * Statuses that mean "cannot proceed". Substring matching is deliberate here — the real
 * boards write `blocked-on-hub`, `human-blocked`, `cross-repo-locked`, `awaiting-founder`
 * — but see the negation strip below before changing it.
 */
const BLOCKING_STATUS = /block|lock|human|external|hub|gated|deferred|waiting|staged|pending|approval/i;

/**
 * S312 — `unblocked` CONTAINS `blocked`.
 *
 * This function is the ONLY producer of the `blocked` bucket, and until S312 it asked
 * `BLOCKING_STATUS.test(status)` against the raw string. The single most common status on
 * every board is the literal word `unblocked`, which contains `block`, so the one value
 * that means "not blocked" was classified as blocked. Measured live at S312: 1126 of the
 * 1144 tasks the blocker DAG called blocked carried `status: "unblocked"` — 98.4%.
 *
 * The consequences were all downstream and all founder-facing. The startup brief's TOP
 * BLOCKER CASCADES tile published "blocked 1135 tasks · founder-gate 270 · credential 81"
 * from this number. S311 read the same number as evidence of 4.6x growth in blocked work
 * and opened `[SIL][S311 #2]` to raise blocker-taxonomy coverage above 75% — a coverage
 * gap that could never close, because no blocker taxonomy can classify tasks that are not
 * blocked. The real blocked population is ~18.
 *
 * Strip the negated form before asking the question. `human-blocked` and `blocked-on-hub`
 * are untouched by the strip (neither contains a standalone `unblocked` token), so every
 * genuinely-blocking status keeps its classification.
 */
function classifyStatus(s) {
  // Returns 'unblocked' | 'blocked' | 'done'
  if (!s) return 'unblocked';
  if (TERMINAL_TASK_STATUS.test(String(s).trim())) return 'done';
  const withoutNegation = String(s).toLowerCase().replace(/\bun-?blocked\b/g, ' ');
  if (BLOCKING_STATUS.test(withoutNegation)) return 'blocked';
  return 'unblocked';
}

export { classifyStatus, BLOCKING_STATUS };

export function loadProjectTaskBoard(project) {
  if (!project?.localPath) return null;
  const tbPath = path.join(project.localPath, 'context', 'TASK_BOARD.md');
  if (!fs.existsSync(tbPath)) return { slug: project.slug, name: project.name, present: false };
  const content = readText(tbPath);
  const items = parseTaskBoard(content).filter(i => !i.done);
  let unblocked = 0, blocked = 0, critical = 0, high = 0;
  for (const it of items) {
    const bucket = classifyStatus(it.status);
    if (bucket === 'blocked') blocked++;
    else if (bucket === 'unblocked') unblocked++;
    it.bucket = bucket;
    if (it.tier === 'critical') critical++;
    else if (it.tier === 'high') high++;
  }
  return {
    slug: project.slug,
    name: project.name,
    localPath: project.localPath,
    vaultStatus: project.vaultStatus || 'forge',
    audience: project.audience,
    present: true,
    remaining: items.length,
    unblocked,
    blocked,
    critical,
    high,
    items,
  };
}

export function loadPortfolioTaskBoards(options = {}) {
  const studioRoot = options.studioRoot || STUDIO_ROOT;
  const registry = readJson(path.join(studioRoot, 'portfolio', 'PROJECT_REGISTRY.json'), { projects: [] });
  const currentRepoPath = options.currentRepoPath || studioRoot;
  const currentRepoAbs = path.resolve(currentRepoPath);

  const byProject = [];
  let totalRemaining = 0, totalUnblocked = 0, totalBlocked = 0, totalCritical = 0, totalHigh = 0;
  let projectsWithWork = 0, projectsScanned = 0, projectsMissing = 0;

  for (const project of registry.projects ?? []) {
    if (!project.localPath) continue;
    const loaded = loadProjectTaskBoard(project);
    if (!loaded) continue;
    loaded.isCurrent = path.resolve(project.localPath) === currentRepoAbs;
    projectsScanned++;
    if (!loaded.present) { projectsMissing++; byProject.push(loaded); continue; }
    if (loaded.remaining > 0) projectsWithWork++;
    totalRemaining += loaded.remaining;
    totalUnblocked += loaded.unblocked;
    totalBlocked += loaded.blocked;
    totalCritical += loaded.critical;
    totalHigh += loaded.high;
    byProject.push(loaded);
  }

  // Sort: current repo first, then by unblocked desc, then by remaining desc.
  byProject.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    if ((b.unblocked ?? 0) !== (a.unblocked ?? 0)) return (b.unblocked ?? 0) - (a.unblocked ?? 0);
    return (b.remaining ?? 0) - (a.remaining ?? 0);
  });

  return {
    generatedAt: new Date().toISOString(),
    projectsScanned,
    projectsMissing,
    projectsWithWork,
    totals: {
      remaining: totalRemaining,
      unblocked: totalUnblocked,
      blocked: totalBlocked,
      critical: totalCritical,
      high: totalHigh,
    },
    byProject,
  };
}

// CLI entrypoint — print summary if run directly.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cross-repo-tasks.mjs')) {
  const asJson = process.argv.includes('--json');
  const result = loadPortfolioTaskBoards();
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  console.log(`Portfolio task-board scan — ${result.projectsScanned} repos (${result.projectsMissing} missing TASK_BOARD, ${result.projectsWithWork} with open work)`);
  console.log(`Totals: ${result.totals.remaining} remaining · ${result.totals.unblocked} unblocked · ${result.totals.blocked} blocked · 🔥 ${result.totals.critical} · ⚡ ${result.totals.high}`);
  console.log('');
  const rows = result.byProject.filter(p => p.present && p.remaining > 0);
  const w = Math.max(...rows.map(p => (p.name || p.slug || '').length), 10);
  console.log(`${'Project'.padEnd(w)}  rem  unb  blk  🔥  ⚡`);
  for (const p of rows) {
    const prefix = p.isCurrent ? '→ ' : '  ';
    console.log(`${prefix}${(p.name || p.slug).padEnd(w - 2)}  ${String(p.remaining).padStart(3)}  ${String(p.unblocked).padStart(3)}  ${String(p.blocked).padStart(3)}  ${String(p.critical).padStart(2)}  ${String(p.high).padStart(2)}`);
  }
}
