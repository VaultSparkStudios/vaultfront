/**
 * model-routing.mjs — the single resolver for "which model should this repo run?"
 *
 * Before S310 three scripts each carried their own copy of the tier logic and
 * they had drifted apart:
 *   - apply-model-routing.mjs   had bySlug + a derivationRule
 *   - recommend-model.mjs       had bySlug ONLY (every unassigned repo read
 *                               back as "no assignment", never as its real tier)
 *   - the derivationRule itself matched ZERO projects (see deadSteps below)
 *
 * Everything now routes through here. The routing JSON is the data; this file
 * is the only thing that interprets it.
 *
 * The two hard rules this module enforces:
 *   1. A pin must be a FLOATING alias (`opus`, `opus[1m]`, `sonnet`, …), never a
 *      dated snapshot (`claude-opus-4-8[1m]`). A dated ID reads correct the day
 *      it is written and then silently decays as newer models ship.
 *   2. An unrecognized predicate in a derivation step THROWS. The rule this
 *      replaced failed silently — it tested `developmentPhase === 'active'`
 *      against a registry whose 26 phase strings never include "active", so
 *      every unassigned project quietly fell through to the cheapest tier.
 *      A predicate that cannot match must be loud, not invisible.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Model values that track the newest release of their family. These are the
 * ONLY values allowed in a `.claude/settings.json` "model" field.
 *
 * Deliberately an allowlist, not a `claude-*` blocklist: a future
 * `claude-opus-6[1m]` is just as stale-prone as today's `claude-opus-4-8[1m]`,
 * and only an allowlist catches the one that hasn't been released yet.
 */
export const FLOATING_MODEL_RE = /^(default|opus|sonnet|haiku)(\[1m\])?$/;

/**
 * Valid at the `/model` prompt but NOT in settings.json — Claude Code rejects
 * them there. Kept distinct so a repo pinning one is reported as "wrong file"
 * rather than mislabelled a decaying dated ID.
 */
export const SLASH_ONLY_ALIASES = new Set(['opusplan']);

export function isFloatingModel(value) {
  return typeof value === 'string' && FLOATING_MODEL_RE.test(value);
}

/** A pin that names a specific model version — correct today, stale tomorrow. */
export function isDatedModelId(value) {
  if (typeof value !== 'string' || !value.length) return false;
  if (isFloatingModel(value) || SLASH_ONLY_ALIASES.has(value)) return false;
  return true;
}

export function loadRouting(studioOpsRoot) {
  return JSON.parse(fs.readFileSync(path.join(studioOpsRoot, 'portfolio', 'MODEL_ROUTING.json'), 'utf8'));
}

const PREDICATES = {
  vaultStatus: (proj, want) => (proj.vaultStatus || '').toLowerCase() === String(want).toLowerCase(),
  audience: (proj, want) => (proj.audience || '') === want,
  audiencePrefix: (proj, want) => (proj.audience || '').startsWith(want),
  phaseInactive: (proj, want, rule) => {
    const inactive = (rule.inactivePhases || []).map(p => p.toLowerCase());
    return inactive.includes((proj.developmentPhase || '').toLowerCase()) === !!want;
  },
};

function stepMatches(step, proj, rule) {
  const when = step.when || {};
  for (const [key, want] of Object.entries(when)) {
    const fn = PREDICATES[key];
    if (!fn) {
      throw new Error(
        `MODEL_ROUTING.json derivationRule: unknown predicate "${key}". ` +
        `Known predicates: ${Object.keys(PREDICATES).join(', ')}. ` +
        `A predicate that cannot be evaluated would silently match nothing — refusing to guess.`
      );
    }
    if (!fn(proj, want, rule)) return false;
  }
  return true;
}

/**
 * Resolve a project's tier.
 * @returns {{tier: string, source: 'bySlug'|'derived', derivedTier: string, why: string}}
 *   `derivedTier` is always populated so callers can surface an explicit
 *   bySlug override that disagrees with what the rule would have picked.
 */
export function resolveTier(proj, routing) {
  const rule = routing.derivationRule || { steps: [] };
  let derivedTier = 'T1_sonnet';
  let why = 'no matching step — fallback';
  for (const step of rule.steps || []) {
    if (stepMatches(step, proj, rule)) {
      derivedTier = step.tier;
      why = step.why || '';
      break;
    }
  }
  const override = routing.bySlug?.[proj.slug];
  if (override) return { tier: override, source: 'bySlug', derivedTier, why: 'explicit bySlug assignment' };
  return { tier: derivedTier, source: 'derived', derivedTier, why };
}

/** The floating alias a tier pins. Throws if the routing file itself is stale. */
export function modelForTier(tier, routing) {
  const def = routing.tiers?.[tier];
  if (!def) return null;
  if (!isFloatingModel(def.model)) {
    throw new Error(
      `MODEL_ROUTING.json tier "${tier}" pins "${def.model}", which is not a floating alias. ` +
      `Tiers must pin an alias that tracks the newest release.`
    );
  }
  return def.model;
}

/**
 * Derivation steps that match no project in the registry.
 *
 * This is the detector for the exact bug that motivated S310: a rule branch can
 * be syntactically valid, well-commented, and match nothing at all — at which
 * point it is not policy, it is dead code that looks like policy. The fallback
 * step (empty `when`) is excluded; matching everything is its job.
 */
export function deadSteps(routing, projects) {
  const rule = routing.derivationRule || { steps: [] };
  const dead = [];
  for (const step of rule.steps || []) {
    if (!step.when || Object.keys(step.when).length === 0) continue; // fallback
    const hits = projects.filter(p => {
      try { return stepMatches(step, p, rule); } catch { return false; }
    }).length;
    if (hits === 0) dead.push({ when: step.when, tier: step.tier, why: step.why });
  }
  return dead;
}
