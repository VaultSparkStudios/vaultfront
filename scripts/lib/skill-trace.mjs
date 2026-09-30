/**
 * skill-trace.mjs — Universal skill-execution telemetry contract (G1, S118).
 *
 * Every Studio OS skill (/start, /audit, /implement, /go, /closeout) writes a
 * structured trace to .cache/skill-trace/<skill>-<sessionId>.json so we can:
 *
 *   (a) Resume re-entrant skills (especially /closeout) from the last
 *       completed step instead of double-writing append-only files.
 *   (b) Audit whether a protocol was actually followed end-to-end.
 *   (c) Roll up cross-skill telemetry into SIL Automation Coverage.
 *
 * Trace schema (v1.0):
 *   {
 *     schemaVersion: "1.0",
 *     skill: "studio-start" | "audit" | "implement" | "go" | "studio-closeout",
 *     sessionId: short hash (matches .session-lock),
 *     startedAt: ISO-8601 UTC,
 *     finishedAt: ISO-8601 UTC | null,
 *     status: "running" | "completed" | "deferred" | "failed",
 *     steps: [
 *       { id: "§3.1", label: "Write-back", startedAt, finishedAt, status, output?, error? }
 *     ],
 *     summary: { shipped: N, deferred: N, blocked: N } | null,
 *     versionSha: short sha of the SKILL.md that ran (from MANIFEST.json),
 *   }
 *
 * Usage:
 *   import { startTrace, recordStep, finishTrace, findOpenTrace } from './lib/skill-trace.mjs';
 *
 *   const trace = startTrace(repoRoot, { skill: 'studio-closeout', sessionId: '118' });
 *   recordStep(repoRoot, trace.sessionId, { id: '§3.1', label: 'Write-back', status: 'completed' });
 *   finishTrace(repoRoot, trace.sessionId, { status: 'completed', summary: { shipped: 4 } });
 *
 * Re-entrancy:
 *   const open = findOpenTrace(repoRoot, 'studio-closeout');
 *   if (open) { const done = new Set(open.steps.filter(s => s.status === 'completed').map(s => s.id)); ... }
 */

import fs from 'fs';
import path from 'path';

const SCHEMA_VERSION = '1.0';
const TRACE_DIR = path.join('.cache', 'skill-trace');

function traceDir(repoRoot) {
  return path.join(repoRoot, TRACE_DIR);
}

function tracePath(repoRoot, skill, sessionId) {
  return path.join(traceDir(repoRoot), `${skill}-${sessionId}.json`);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function readManifestVersion(skill) {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const manifestPath = path.join(home, '.claude', 'skills', 'MANIFEST.json');
    const m = readJsonSafe(manifestPath);
    return m?.skills?.[skill]?.sha || null;
  } catch { return null; }
}

/**
 * Start a new trace (or attach to an existing open one for the same session+skill).
 * @returns {{sessionId, skill, resumed: boolean, trace}}
 */
export function startTrace(repoRoot, { skill, sessionId, label }) {
  if (!skill || !sessionId) throw new Error('skill and sessionId required');
  const p = tracePath(repoRoot, skill, sessionId);
  const existing = readJsonSafe(p);
  // Any existing trace for the same (skill, sessionId) is a resume — including
  // completed ones. Re-running /closeout in the same session must not lose
  // history (otherwise it would re-execute append-only writes). Caller decides
  // what to do with completed step IDs.
  if (existing) {
    return { sessionId, skill, resumed: true, trace: existing };
  }
  const trace = {
    schemaVersion: SCHEMA_VERSION,
    skill,
    sessionId,
    label: label ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    steps: [],
    summary: null,
    versionSha: readManifestVersion(skill),
  };
  writeJson(p, trace);
  return { sessionId, skill, resumed: false, trace };
}

/**
 * Record a step. If step.id already exists, the existing entry is updated.
 * @param {object} step  { id, label, status: 'started'|'completed'|'failed'|'skipped', output?, error? }
 */
export function recordStep(repoRoot, sessionId, skill, step) {
  if (!step?.id) throw new Error('step.id required');
  const p = tracePath(repoRoot, skill, sessionId);
  const trace = readJsonSafe(p);
  if (!trace) return null;
  const now = new Date().toISOString();
  const existing = trace.steps.find(s => s.id === step.id);
  if (existing) {
    Object.assign(existing, step, { finishedAt: step.status === 'started' ? null : now });
  } else {
    trace.steps.push({
      id: step.id,
      label: step.label ?? null,
      startedAt: step.startedAt ?? now,
      finishedAt: step.status === 'started' ? null : now,
      status: step.status ?? 'completed',
      output: step.output ?? null,
      error: step.error ?? null,
    });
  }
  writeJson(p, trace);
  return trace;
}

/**
 * Finish a trace.
 * @param {object} info  { status: 'completed'|'deferred'|'failed', summary?, error? }
 */
export function finishTrace(repoRoot, sessionId, skill, info) {
  const p = tracePath(repoRoot, skill, sessionId);
  const trace = readJsonSafe(p);
  if (!trace) return null;
  trace.status = info.status ?? 'completed';
  trace.finishedAt = new Date().toISOString();
  if (info.summary) trace.summary = info.summary;
  if (info.error) trace.error = info.error;
  writeJson(p, trace);
  return trace;
}

/**
 * Find an open (running) trace for a skill, regardless of sessionId. Returns
 * null if none. Used by re-entrant /closeout to detect resumption.
 */
export function findOpenTrace(repoRoot, skill) {
  const dir = traceDir(repoRoot);
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir)
    .filter(f => f.startsWith(`${skill}-`) && f.endsWith('.json'))
    .map(f => readJsonSafe(path.join(dir, f)))
    .filter(t => t && t.status === 'running')
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  return entries[0] || null;
}

/**
 * Completed step IDs for re-entrancy gates.
 */
export function completedStepIds(trace) {
  return new Set((trace?.steps || []).filter(s => s.status === 'completed').map(s => s.id));
}

/**
 * Read the trace for a specific (skill, sessionId).
 */
export function readTrace(repoRoot, skill, sessionId) {
  return readJsonSafe(tracePath(repoRoot, skill, sessionId));
}

/**
 * List all traces for a given skill (newest first).
 */
export function listTraces(repoRoot, skill) {
  const dir = traceDir(repoRoot);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => (skill ? f.startsWith(`${skill}-`) : true) && f.endsWith('.json'))
    .map(f => readJsonSafe(path.join(dir, f)))
    .filter(Boolean)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

export default {
  startTrace,
  recordStep,
  finishTrace,
  findOpenTrace,
  completedStepIds,
  readTrace,
  listTraces,
};
