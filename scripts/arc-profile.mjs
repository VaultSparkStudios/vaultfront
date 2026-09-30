#!/usr/bin/env node
// arc-profile.mjs — resolve the customization profile for the `arc` skill in ANY repo.
//
// The arc skill (global, runs in every VaultSpark project, any AI model) calls this to
// learn how to tailor itself to the current project: type, audience, git workflow, SIL
// rubric, staging gate, and the right audit lens. Single source of truth — lives in the
// studio-ops control plane and is referenced from siblings via:
//     node ../vaultspark-studio-ops/scripts/arc-profile.mjs [targetDir]
// (defaults to the current working directory). The PROJECT_REGISTRY is resolved relative
// to THIS script, so it works no matter which repo calls it.
//
//   --json   emit machine-readable JSON only (default: human line + JSON)

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { projectMedium } from './lib/media-profile.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REGISTRY = path.join(HERE, '..', 'portfolio', 'PROJECT_REGISTRY.json');

export function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch { return null; }
}

// Find the registry entry for this folder. Prefer exact slug match, then the LONGEST
// slug that is a substring of the folder name (avoids short-slug false positives).
export function resolveEntry(reg, basename) {
  const projects = reg && Array.isArray(reg.projects) ? reg.projects
                 : Array.isArray(reg) ? reg : [];
  const withSlug = projects.filter(p => p && p.slug);
  const norm = (s) => String(s || '').toLowerCase();
  const basenameNorm = norm(basename);
  const entryKeys = (p) => [
    p.slug,
    p.folderName,
    p.localPath ? path.basename(String(p.localPath).replace(/[\\/]+$/, '')) : null,
  ].filter(Boolean).map(norm);
  const exact = withSlug.find(p => entryKeys(p).includes(basenameNorm));
  if (exact) return exact;
  const subs = withSlug
    .filter(p => entryKeys(p).some(k => basenameNorm.includes(k) || k.includes(basenameNorm)))
    .sort((a, b) => b.slug.length - a.slug.length);
  return subs[0] || null;
}

export function deriveDeployableSurfaces(entry, targetDir = null) {
  const surfaces = [];
  const add = (surface) => {
    if (!surface?.id || surfaces.some((row) => row.id === surface.id)) return;
    surfaces.push(surface);
  };
  const urls = [
    ['runtime', entry?.runtimeUrl],
    ['live', entry?.liveUrl],
    ['deployed', entry?.deployedUrl],
  ];
  for (const [field, value] of urls) {
    if (typeof value !== 'string' || !/^https:\/\//i.test(value.trim())) continue;
    let host;
    try { host = new URL(value).hostname; } catch { continue; }
    add({ id: `runtime:${host}`, kind: 'runtime', target: value, evidence: `registry.${field}Url` });
  }
  for (const declared of Array.isArray(entry?.deployableSurfaces) ? entry.deployableSurfaces : []) {
    if (typeof declared === 'string') add({ id: declared, kind: 'declared', target: null, evidence: 'registry.deployableSurfaces' });
    else add({ ...declared, evidence: declared.evidence || 'registry.deployableSurfaces' });
  }
  if (targetDir) {
    const scriptsDir = path.join(path.resolve(targetDir), 'scripts');
    let names = [];
    try { names = fs.readdirSync(scriptsDir, { withFileTypes: true }).filter((row) => row.isFile()).map((row) => row.name); } catch {}
    for (const name of names.filter((value) => /^deploy-[a-z0-9-]+\.mjs$/i.test(value)).sort()) {
      add({ id: `deployer:${name.replace(/\.mjs$/i, '')}`, kind: 'operational-deployer', target: `scripts/${name}`, evidence: 'repository deployer' });
    }
  }
  return surfaces;
}

/**
 * S347 [audit #5] — closes [SIL][S346 #2]. The outward actions a session on this
 * project will need, named up front so the founder can authorize them at /start.
 * S346 met three refusals (production deploy, agent-config sync, stash drop) only
 * at the moment of use, after the work was done. A harness permission cannot be
 * probed without attempting the action, so the honest move is to NAME the gated
 * actions early, not to pretend they were checked. `gated` marks what the
 * harness is known to refuse without an explicit authorization in the conversation.
 */
export function deriveOutwardActions({ deployableSurfaces = [], hasStaging = false, stagingType = null, sanitizeBeforePush = false } = {}) {
  const actions = [{ id: 'push:main', what: 'commit + push directly to main', gated: false,
    note: sanitizeBeforePush ? 'public repo — sanitize before push' : null }];
  for (const surface of deployableSurfaces) {
    if (surface.kind === 'runtime') continue;
    const production = /release|cron|relay|server|safety/i.test(surface.id);
    actions.push({ id: surface.id, what: `run ${surface.target || surface.id}`,
      gated: production,
      note: production ? 'production-affecting — the harness refuses without explicit founder authorization this session' : null });
  }
  if (hasStaging) actions.push({ id: 'promote:production', what: `promote from staging (${stagingType}) to production`, gated: true,
    note: 'production deploy — authorize at /start' });
  return actions;
}

export function deriveProfile(entry, basename = '', targetDir = null) {
  const slug = entry?.slug || basename;
  const audience = entry?.audience || 'internal';
  const vaultStatus = String(entry?.vaultStatus || 'forge').toUpperCase();
  const stagingType = entry?.stagingType || (audience === 'internal' ? 'none' : 'unknown');

  // `type` is often a multi-tag string ("novel,shared-universe", "dashboard,pwa,crypto")
  // or absent. Parse tags and reduce to one primary type for rubric + lens.
  const rawType = String(entry?.type || '').toLowerCase();
  const tags = rawType.split(/[,\s]+/).filter(Boolean);
  const has = (...names) => names.some(n => tags.includes(n));
  let type;
  if (projectMedium(entry || {}) === 'media') type = 'media';
  else if (has('game')) type = 'game';
  else if (has('novel')) type = 'novel';
  else if (has('website')) type = 'website';
  else if (has('app', 'pwa', 'saas', 'dashboard', 'tool', 'mobile', 'web', 'crypto')) type = 'app';
  else type = (audience === 'internal') ? 'infrastructure' : 'app';

  // SIL rubric (CANON-009): product rubric for any product type; infrastructure for infra/internal-ops.
  const rubric = type === 'infrastructure' ? 'infrastructure' : 'product';

  // Git workflow (founder directive — generalizes D-S180.7): ALL projects push DIRECTLY
  // to main. Projects WITH a staging/testing env deploy + verify there FIRST, then promote
  // to main. Public repos sanitize before pushing. Never force-push.
  const hasStaging = !!stagingType && !['none', 'unknown'].includes(stagingType);
  const deployableSurfaces = deriveDeployableSurfaces(entry, targetDir);
  const hasDeployableSurfaces = deployableSurfaces.length > 0;
  const sanitizeBeforePush = /^public/.test(audience);
  const gitWorkflow = 'direct-to-main';
  let gitReason = hasStaging
    ? `direct-to-main — deploy + verify on staging (${stagingType}) FIRST, then promote to main`
    : (stagingType === 'unknown'
        ? 'direct-to-main — confirm if a staging env exists; if so, verify there before main'
        : (hasDeployableSurfaces
            ? 'direct-to-main — no repository-wide staging gate; deployable surfaces use action-specific verification'
            : 'direct-to-main (studio default — no staging gate)'));
  if (sanitizeBeforePush) gitReason += ' · sanitize before push (public)';

  // Type-specific audit lens (which extra review skill to layer in).
  const lensByType = {
    media: 'media-production review: storytelling, continuity, footage, sound, rights, render stability, cost and exact-export founder review; configured media quality gate',
    game: 'game-loop-review',
    novel: 'novel-continuity-check',
    app: 'app-release-gate + web canon (011 sitemap · 041 mobile · 047 themes · 048 dual-audience · 045 Obelisk SSO · legal/IP)',
    tool: 'app-release-gate + web canon',
    website: 'app-release-gate + web canon (011/041/047/048/045 + legal/IP completeness)',
    infrastructure: 'infra-debt-sweep',
  };
  const auditLens = lensByType[type] || lensByType[rubric === 'product' ? 'app' : 'infrastructure'];

  const stagingGate = hasStaging
    ? `deploy + verify on staging (${stagingType}) BEFORE promoting to main`
    : (stagingType === 'unknown'
        ? 'confirm staging env; verify there before main if it exists'
        : (hasDeployableSurfaces
            ? 'none — no repository-wide staging environment; each deployable surface still requires action-specific proof'
            : 'none — push straight to main'));

  const outwardActions = deriveOutwardActions({ deployableSurfaces, hasStaging, stagingType, sanitizeBeforePush });
  return { slug, basename, type, medium: projectMedium(entry || {}), audience, vaultStatus, stagingType, hasStaging, deployableSurfaces, hasDeployableSurfaces, sanitizeBeforePush, rubric, gitWorkflow, gitReason, auditLens, stagingGate, outwardActions, registryMatched: !!entry };
}

// One-call resolver: profile for an arbitrary project directory. Reused by the
// canon-conformance engine (scripts/lib/canon-matrix.mjs) so every surface profiles
// a project identically. Also returns the raw registry `entry` for richer predicates
// (revenueModel, brandingRequired, etc.) that the conformance matrix may read.
export function canonicalTargetBasename(targetDir = process.cwd()) {
  const resolved = path.resolve(String(targetDir || process.cwd()));
  return resolved.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}

export function profileFor(targetDir = process.cwd()) {
  const basename = canonicalTargetBasename(targetDir);
  const reg = loadRegistry();
  const entry = reg ? resolveEntry(reg, basename) : null;
  let localEntry = null;
  if (!entry) {
    try { localEntry = JSON.parse(fs.readFileSync(path.join(path.resolve(targetDir), 'context', 'PROJECT_STATUS.json'), 'utf8')); } catch {}
  }
  const sourceEntry = entry || localEntry;
  return { ...deriveProfile(sourceEntry, basename, targetDir), registryMatched: !!entry, profileSource: entry ? 'registry' : localEntry ? 'project-status' : 'fallback', entry: sourceEntry };
}

// CLI guard — only run the human/JSON output when invoked directly, not on import.
if (process.argv[1] && url.pathToFileURL(process.argv[1]).href === import.meta.url) {
  const JSON_ONLY = process.argv.includes('--json');
  const targetArg = process.argv.slice(2).find(a => !a.startsWith('--'));
  const target = targetArg || process.cwd();
  const { entry, ...profile } = profileFor(target);
  if (JSON_ONLY) {
    console.log(JSON.stringify(profile, null, 2));
  } else {
    console.log(`arc profile · ${profile.slug}${profile.registryMatched ? '' : ' (NOT in registry — inferred)'}`);
    console.log(`  type=${profile.type} · audience=${profile.audience} · vaultStatus=${profile.vaultStatus}`);
    console.log(`  SIL rubric=${profile.rubric} · audit lens=${profile.auditLens}`);
    console.log(`  git=${profile.gitWorkflow}  (${profile.gitReason})`);
    console.log(`  staging=${profile.stagingGate}`);
    console.log(`  deployable surfaces=${profile.deployableSurfaces.length ? profile.deployableSurfaces.map((surface) => surface.id).join(', ') : 'none'}`);
    const gated = (profile.outwardActions || []).filter((a) => a.gated);
    if (gated.length) console.log(`  ⚠ authorize at /start (harness-gated at use): ${gated.map((a) => a.id).join(', ')}`);
    console.log(JSON.stringify(profile));
  }
}
