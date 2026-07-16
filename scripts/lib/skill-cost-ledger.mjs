/**
 * skill-cost-ledger.mjs — Token-cost telemetry vs declared SLO (R-H15, S118).
 *
 * Each /start, /audit, /implement, /go, /closeout run can record its actual
 * token cost (from context-meter ledger) and compare against the SLO declared
 * in its SKILL.md frontmatter (slo-token-budget).
 *
 * Append-only log at .cache/skill-costs.jsonl — one line per skill run:
 *   { ts, skill, sessionId, slo, actual, overrun, status }
 *
 * /start surfaces a one-line warning when the prior run of the same skill
 * exceeded its budget.
 */

import fs from "fs";
import os from "os";
import path from "path";

const LEDGER = path.join(".cache", "skill-costs.jsonl");
const MANIFEST = path.join(os.homedir(), ".claude", "skills", "MANIFEST.json");

function readManifestSlo(skill) {
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    return m.skills?.[skill]?.slo || null;
  } catch {
    return null;
  }
}

/**
 * Record a skill run's actual token consumption.
 * @param {object} info { skill, sessionId, actualTokens, durationSec?, status? }
 */
export function recordSkillCost(repoRoot, info) {
  const ledgerPath = path.join(repoRoot, LEDGER);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const slo = readManifestSlo(info.skill);
  const entry = {
    ts: new Date().toISOString(),
    skill: info.skill,
    sessionId: info.sessionId || null,
    medium: info.medium || null,
    slo: slo
      ? { tokenBudget: slo.tokenBudget, wallClockMaxSec: slo.wallClockMaxSec }
      : null,
    actual: {
      tokens: info.actualTokens ?? null,
      durationSec: info.durationSec ?? null,
    },
    overrun:
      slo?.tokenBudget && info.actualTokens
        ? {
            tokens: Math.max(0, info.actualTokens - slo.tokenBudget),
            pct: Math.round(
              ((info.actualTokens - slo.tokenBudget) / slo.tokenBudget) * 100,
            ),
          }
        : null,
    status: info.status || "completed",
    // S156 #14 — optional §-step decomposition [{id, tokens}] incl. residual
    // "(unattributed)" bucket; sum reconciles with actual.tokens.
    ...(info.steps?.length ? { steps: info.steps } : {}),
  };
  fs.appendFileSync(ledgerPath, JSON.stringify(entry) + "\n");
  return entry;
}

/**
 * Most-recent entries from the ledger, optionally filtered to a skill.
 */
export function recentSkillCosts(repoRoot, { skill, limit = 10 } = {}) {
  const p = path.join(repoRoot, LEDGER);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  const parsed = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const filtered = skill ? parsed.filter((e) => e.skill === skill) : parsed;
  return filtered.slice(-limit).reverse();
}

/**
 * Detect SLO breach in the prior run of a given skill. Returns null if no
 * prior run or no breach.
 */
export function priorOverrun(repoRoot, skill) {
  const recent = recentSkillCosts(repoRoot, { skill, limit: 1 });
  const e = recent[0];
  if (!e || !e.overrun || e.overrun.tokens <= 0) return null;
  return e;
}

/**
 * S120 #5 — detect skills with N-consecutive SLO overruns (regression signal).
 * Returns array of { skill, consecutiveOverruns, lastOverrunPct, samples }
 * for skills with ≥threshold consecutive overruns in their most-recent runs.
 */
export function detectRegressions(
  repoRoot,
  { threshold = 3, lookback = 5 } = {},
) {
  const p = path.join(repoRoot, LEDGER);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  const parsed = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const bySkill = new Map();
  for (const e of parsed) {
    if (!e.skill) continue;
    if (!bySkill.has(e.skill)) bySkill.set(e.skill, []);
    bySkill.get(e.skill).push(e);
  }
  const regressions = [];
  for (const [skill, entries] of bySkill) {
    const recent = entries.slice(-lookback);
    if (recent.length < threshold) continue;
    let consecutive = 0;
    let lastOverrunPct = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      const e = recent[i];
      if (e.overrun && e.overrun.tokens > 0) {
        consecutive++;
        if (i === recent.length - 1) lastOverrunPct = e.overrun.pct || 0;
      } else break;
    }
    if (consecutive >= threshold) {
      regressions.push({
        skill,
        consecutiveOverruns: consecutive,
        lastOverrunPct,
        samples: recent.length,
      });
    }
  }
  return regressions;
}

/**
 * S154 audit #1 — severe-overrun gate. Unlike detectRegressions (3+ overruns
 * of any size), this fires when a skill costs >150% of its SLO budget
 * (overrun pct ≥ 50) for `consecutive`+ most-recent runs. Reads the ledger
 * directly so the doctor probe and the brief tile share one source of truth
 * (S153 divergent-observability lesson — no manifest-flag intermediary).
 * Returns [{ skill, consecutive, lastPct, budget, lastActual, hint }].
 */
export function detectSevereOverruns(
  repoRoot,
  { pctThreshold = 50, consecutive = 2, lookback = 6 } = {},
) {
  const p = path.join(repoRoot, LEDGER);
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  const parsed = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const bySkill = new Map();
  for (const e of parsed) {
    if (!e.skill) continue;
    if (!bySkill.has(e.skill)) bySkill.set(e.skill, []);
    bySkill.get(e.skill).push(e);
  }
  const severe = [];
  for (const [skill, entries] of bySkill) {
    const recent = entries.slice(-lookback);
    if (recent.length < consecutive) continue;
    let run = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      const e = recent[i];
      if (e.overrun && (e.overrun.pct ?? 0) >= pctThreshold) run++;
      else break;
    }
    if (run >= consecutive) {
      const last = recent[recent.length - 1];
      severe.push({
        skill,
        consecutive: run,
        lastPct: last.overrun?.pct ?? 0,
        budget: last.slo?.tokenBudget ?? null,
        lastActual: last.actual?.tokens ?? null,
        hint: `node scripts/skill-budget-check.mjs ${skill}`,
      });
    }
  }
  return severe;
}

/**
 * Write regression flags into ~/.claude/skills/MANIFEST.json so /start brief
 * can surface them. Returns count of skills flagged.
 */
export function flagRegressionsInManifest(repoRoot, opts = {}) {
  const regressions = detectRegressions(repoRoot, opts);
  if (!fs.existsSync(MANIFEST)) return 0;
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    if (!m.skills) return 0;
    let flagged = 0;
    for (const [skill, spec] of Object.entries(m.skills)) {
      const r = regressions.find((x) => x.skill === skill);
      if (r) {
        spec.regressionFlag = {
          consecutiveOverruns: r.consecutiveOverruns,
          lastOverrunPct: r.lastOverrunPct,
          flaggedAt: new Date().toISOString(),
        };
        flagged++;
      } else if (spec.regressionFlag) {
        delete spec.regressionFlag;
      }
    }
    fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n");
    return flagged;
  } catch {
    return 0;
  }
}

// S125 audit #23: per-medium skill-cost bucketing
// Average actual-tokens per (skill, medium) across history. Used by
// render-startup-brief to emit soft budget hints sized to project complexity.
export function mediumBucketAvg(
  repoRoot,
  { skill, medium, lookback = 20 } = {},
) {
  const all = recentSkillCosts(repoRoot, { skill, limit: lookback * 4 });
  const byMedium = all
    .filter((e) => e.medium === medium && e.actual?.tokens != null)
    .slice(0, lookback);
  if (!byMedium.length) return null;
  const sum = byMedium.reduce((s, e) => s + e.actual.tokens, 0);
  return {
    skill,
    medium,
    samples: byMedium.length,
    avgTokens: Math.round(sum / byMedium.length),
  };
}

// Recommended budget for a skill in a given medium. Falls back to SLO budget
// from MANIFEST, then to 5000 tokens.
export function recommendedBudget(repoRoot, skill, medium) {
  const bucket = mediumBucketAvg(repoRoot, { skill, medium });
  if (bucket && bucket.samples >= 3) {
    // soft target: 1.2× rolling average (gives headroom without overshoot)
    return {
      source: "medium-bucket",
      budget: Math.round(bucket.avgTokens * 1.2),
      basis: `${bucket.samples} samples`,
      medium,
    };
  }
  const slo = readManifestSlo(skill);
  if (slo?.tokenBudget)
    return { source: "manifest-slo", budget: slo.tokenBudget, medium };
  return { source: "default", budget: 5000, medium };
}

export default {
  recordSkillCost,
  recentSkillCosts,
  priorOverrun,
  detectRegressions,
  detectSevereOverruns,
  flagRegressionsInManifest,
  mediumBucketAvg,
  recommendedBudget,
};
