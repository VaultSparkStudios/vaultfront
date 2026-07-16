#!/usr/bin/env node
/**
 * cache-ledger-rollup.mjs — S178 (ITEM 4). Monthly burn rollup + cost-outlier flags.
 *
 * Complements render-cache-ledger.mjs (rolling N-day snapshot) with a MONTHLY
 * view: per-calendar-month spend, cache-hit rate, batch vs sync split, and
 * statistical outlier detection (which script/month is bleeding cost).
 *
 * Derives entirely from the append-only ledger docs/cache-ledger.ndjson (written
 * by logMetrics() in scripts/lib/model-router.mjs). Never fabricates — a month
 * with no entries shows zero, an empty ledger reports "no data". (CANON-031:
 * surfaces must derive from source-of-truth and never lie.)
 *
 * Outlier definition (honest + bounded): a per-script monthly cost is flagged
 * when it exceeds mean + OUTLIER_SIGMA·stdev across all script-months in window
 * AND is at least $OUTLIER_FLOOR (so a $0.0003 "outlier" on a near-empty ledger
 * is never alarmed). Both thresholds are explicit, not magic.
 *
 * Usage:
 *   node scripts/cache-ledger-rollup.mjs                 → human report
 *   node scripts/cache-ledger-rollup.mjs --json          → JSON to stdout
 *   node scripts/cache-ledger-rollup.mjs --months 6      → window (default: all)
 *   node scripts/ops.mjs cache-rollup   (if wired)
 *
 * Exit code: 0 always (reporting tool). Use --fail-on-outlier to exit 3 when any
 * outlier is flagged (for a future cost-watch CI job).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FALLBACK_PRICE,
  PRICING_PER_MTOK,
  shortModelName,
} from "./lib/model-router.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LEDGER =
  process.env.OPS_CACHE_LEDGER ||
  path.join(ROOT, "docs", "cache-ledger.ndjson");

const OUTLIER_SIGMA = 2; // std-devs above mean to flag
const OUTLIER_FLOOR = 0.05; // USD — never flag sub-nickel "outliers"

const argv = process.argv.slice(2);
const JSON_MODE = argv.includes("--json");
const FAIL_ON_OUTLIER = argv.includes("--fail-on-outlier");
const monthsIdx = argv.indexOf("--months");
const WINDOW_MONTHS =
  monthsIdx !== -1 ? Math.max(1, parseInt(argv[monthsIdx + 1], 10) || 0) : null;

function readEntries(ledgerPath = LEDGER) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs
    .readFileSync(ledgerPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.ts);
}

function entryCost(e) {
  const price = PRICING_PER_MTOK[e.model] || FALLBACK_PRICE;
  return (
    ((e.input || 0) / 1e6) * price.input +
    ((e.cache_create || 0) / 1e6) * price.cacheWrite +
    ((e.cache_read || 0) / 1e6) * price.cacheRead +
    ((e.output || 0) / 1e6) * price.output
  );
}

// S181 [audit #1] — billing-surface awareness (CANON-031 observability honesty).
//
// entryCost() above prices EVERY entry at API LIST rates. But the studio runs on
// the Claude Max + Codex Max FLAT-RATE subscriptions (CANON-015 "Max Plan first";
// the doctor confirms no shell ANTHROPIC_API_KEY exists by design). So the
// interactive Claude Code / Codex conversation tokens — by far the bulk of the
// ledger — cost $0 at the margin: they're already paid for by the subscription.
// Pricing them as metered API spend produced a phantom four-figure "burn" and a
// phantom "runway", three founder-facing surfaces lying at once.
//
// billingSurfaceOf() classifies each entry:
//   - 'interactive-maxplan' → a Stop-hook conversation turn (the Max Plan session
//      itself). REAL marginal cost = $0. These are tagged 'claude-code-interactive'
//      or 'unknown' (an untagged session turn) or carry no script.
//   - 'metered-api'        → anything that genuinely calls the Anthropic API with
//      a key (named API-calling scripts, batch jobs). Counted as REAL cost — we
//      over-count toward metered so we can never UNDER-report real spend.
// An explicit e.billingSurface on the entry always wins (future emitters tag it).
const INTERACTIVE_SCRIPTS = new Set(["claude-code-interactive", "unknown"]);
function billingSurfaceOf(e) {
  if (
    e.billingSurface === "interactive-maxplan" ||
    e.billingSurface === "metered-api"
  )
    return e.billingSurface;
  if (!e.script || INTERACTIVE_SCRIPTS.has(e.script))
    return "interactive-maxplan";
  return "metered-api";
}
// REAL billed cost: $0 for flat-rate interactive turns, list price for metered API.
function entryRealCost(e) {
  return billingSurfaceOf(e) === "metered-api" ? entryCost(e) : 0;
}

// S181 [audit #1] — SHARED cost-anomaly evaluator. Both check-cost-anomaly.mjs
// (the doctor probe) and render-startup-brief.mjs (the /start signal) called their
// OWN inline rolling-window cost check on notional list-price (the S153
// divergent-observability-policies class). They diverged: fixing one left the
// other lying. This single evaluator is the one source of truth — it runs on REAL
// metered cost for the alarm and reports notional separately, always.
export const COST_THRESHOLDS = {
  warnRatio: 1.5,
  failRatio: 3.0,
  minTotalUsd: 1.0,
  dayOutlierFloorUsd: 5.0,
};

export function evaluateCostAnomaly(
  entries,
  { now = new Date(), thresholds = COST_THRESHOLDS } = {},
) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const off = (days) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return iso(d);
  };
  const todayS = iso(now),
    d7 = off(-7),
    d14 = off(-14);

  const byReal = new Map(); // day → real metered USD
  let notInteractive = 0,
    notMetered = 0; // 7d notional split
  for (const e of entries) {
    const day = String(e.ts || "").slice(0, 10);
    if (!day) continue;
    byReal.set(day, (byReal.get(day) || 0) + entryRealCost(e));
    if (day >= d7 && day < todayS) {
      const c = entryCost(e);
      if (entryRealCost(e) > 0) notMetered += c;
      else notInteractive += c;
    }
  }
  const win = (from, to) => {
    let t = 0;
    for (const [d, c] of byReal) if (d >= from && d < to) t += c;
    return t;
  };
  const realMetered7d = win(d7, todayS);
  const priorMetered7d = win(d14, d7);
  const dayCosts = [...byReal.values()];
  const realTotal = dayCosts.reduce((a, b) => a + b, 0);
  const maxDayCost = dayCosts.length ? Math.max(...dayCosts) : 0;
  const avgDayCost = dayCosts.length ? realTotal / dayCosts.length : 0;
  const ratio = priorMetered7d > 0 ? realMetered7d / priorMetered7d : null;
  const dayRatio = avgDayCost > 0 ? maxDayCost / avgDayCost : null;
  const notional7d = {
    interactive: notInteractive,
    metered: notMetered,
    total: notInteractive + notMetered,
  };

  const notionalNote =
    notional7d.total > 0.01
      ? `7d notional $${notional7d.total.toFixed(2)} (flat-rate Max Plan, $0 billed: $${notional7d.interactive.toFixed(2)} interactive + $${notional7d.metered.toFixed(2)} metered)`
      : null;

  let level = "pass";
  const reasons = [];
  if (realTotal < thresholds.minTotalUsd) {
    const base = `real metered total $${realTotal.toFixed(4)} < $${thresholds.minTotalUsd} threshold — no anomaly detection yet`;
    reasons.push(notionalNote ? `${base} · ${notionalNote}` : base);
  } else {
    if (ratio !== null && ratio >= thresholds.failRatio) {
      level = "warn";
      reasons.push(
        `⚠ 7d metered $${realMetered7d.toFixed(4)} vs prior-7d $${priorMetered7d.toFixed(4)} — ${ratio.toFixed(1)}× spike (>3×)`,
      );
    } else if (ratio !== null && ratio >= thresholds.warnRatio) {
      level = "warn";
      reasons.push(
        `7d metered $${realMetered7d.toFixed(4)} vs prior-7d $${priorMetered7d.toFixed(4)} — ${ratio.toFixed(1)}× (>1.5×)`,
      );
    }
    if (
      dayRatio !== null &&
      dayRatio >= thresholds.failRatio &&
      maxDayCost >= thresholds.dayOutlierFloorUsd
    ) {
      level = "warn";
      reasons.push(
        `⚠ max single-day $${maxDayCost.toFixed(4)} vs avg $${avgDayCost.toFixed(4)} — ${dayRatio.toFixed(1)}× (outlier day)`,
      );
    }
  }
  if (reasons.length === 0) {
    const base = `real metered total $${realTotal.toFixed(4)} across ${dayCosts.length} days — normal`;
    reasons.push(notionalNote ? `${base} · ${notionalNote}` : base);
  }
  const sig =
    level === "warn"
      ? ratio !== null && ratio >= thresholds.failRatio
        ? "⛔"
        : "⚠"
      : "✓";
  return {
    level,
    sig,
    ratio,
    realMetered7d,
    priorMetered7d,
    realTotal,
    maxDayCost,
    avgDayCost,
    notional7d,
    notionalNote,
    reasons,
  };
}

/**
 * Roll entries up by calendar month. Returns { months: [...], scriptMonths: [...] }.
 * Pure — takes entries, no I/O. `now` injectable for deterministic tests.
 */
export function rollup(
  entries,
  { windowMonths = null, now = new Date() } = {},
) {
  let filtered = entries;
  if (windowMonths) {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - windowMonths);
    const cutoffMonth = cutoff.toISOString().slice(0, 7);
    filtered = entries.filter((e) => e.ts.slice(0, 7) >= cutoffMonth);
  }

  const byMonth = new Map(); // "YYYY-MM" → totals
  const byScriptMonth = new Map(); // "YYYY-MM|script" → totals

  for (const e of filtered) {
    const month = e.ts.slice(0, 7);
    const cost = entryCost(e);
    const isBatch = e.mode === "batch";

    if (!byMonth.has(month)) {
      byMonth.set(month, {
        month,
        calls: 0,
        cost: 0,
        batchCost: 0,
        syncCost: 0,
        cache_read: 0,
        input: 0,
        output: 0,
        cache_create: 0,
      });
    }
    const m = byMonth.get(month);
    m.calls += 1;
    m.cost += cost;
    if (isBatch) m.batchCost += cost;
    else m.syncCost += cost;
    m.cache_read += e.cache_read || 0;
    m.input += e.input || 0;
    m.output += e.output || 0;
    m.cache_create += e.cache_create || 0;

    const smKey = `${month}|${e.script || "unknown"}`;
    if (!byScriptMonth.has(smKey)) {
      byScriptMonth.set(smKey, {
        month,
        script: e.script || "unknown",
        calls: 0,
        cost: 0,
        models: new Set(),
      });
    }
    const sm = byScriptMonth.get(smKey);
    sm.calls += 1;
    sm.cost += cost;
    sm.models.add(shortModelName(e.model));
  }

  const months = [...byMonth.values()]
    .map((m) => ({
      ...m,
      hitRate:
        m.cache_read + m.input + m.cache_create > 0
          ? m.cache_read / (m.cache_read + m.input + m.cache_create)
          : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const scriptMonths = [...byScriptMonth.values()]
    .map((sm) => ({ ...sm, models: [...sm.models].sort().join(",") }))
    .sort((a, b) => b.cost - a.cost);

  return { months, scriptMonths };
}

/**
 * Flag per-script-month cost outliers. Pure. Returns array of flagged rows with
 * the threshold + z-score so the surface can explain WHY (no opaque alarms).
 */
export function flagOutliers(
  scriptMonths,
  { sigma = OUTLIER_SIGMA, floor = OUTLIER_FLOOR } = {},
) {
  const costs = scriptMonths.map((s) => s.cost);
  if (costs.length < 2) return [];
  const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
  const variance =
    costs.reduce((a, b) => a + (b - mean) ** 2, 0) / costs.length;
  const stdev = Math.sqrt(variance);
  const threshold = mean + sigma * stdev;
  return scriptMonths
    .filter((s) => s.cost > threshold && s.cost >= floor)
    .map((s) => ({
      ...s,
      threshold,
      mean,
      stdev,
      z: stdev > 0 ? (s.cost - mean) / stdev : 0,
    }));
}

function fmtUSD(n) {
  return `$${n.toFixed(4)}`;
}
function fmtPct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function renderReport({ months, scriptMonths, outliers, totalEntries }) {
  const lines = [];
  lines.push("Cache Ledger — Monthly Burn Rollup");
  lines.push("─".repeat(60));
  if (totalEntries === 0) {
    lines.push(
      "  No Claude calls logged in docs/cache-ledger.ndjson — nothing to roll up.",
    );
    return lines.join("\n");
  }
  const grand = months.reduce((a, m) => a + m.cost, 0);
  lines.push(
    `  Months: ${months.length} · Entries: ${totalEntries} · Total est. spend: ${fmtUSD(grand)}`,
  );
  lines.push("");
  lines.push(
    "  Month     Calls   Spend       Batch       Sync        Hit-rate",
  );
  for (const m of months) {
    lines.push(
      `  ${m.month}  ${String(m.calls).padStart(5)}   ${fmtUSD(m.cost).padEnd(10)}  ${fmtUSD(m.batchCost).padEnd(10)}  ${fmtUSD(m.syncCost).padEnd(10)}  ${fmtPct(m.hitRate)}`,
    );
  }
  lines.push("");
  lines.push("  Top 5 script-months by spend:");
  for (const sm of scriptMonths.slice(0, 5)) {
    lines.push(
      `    ${sm.month}  ${sm.script.padEnd(28)} ${fmtUSD(sm.cost)}  (${sm.calls} calls · ${sm.models})`,
    );
  }
  lines.push("");
  if (outliers.length) {
    lines.push(
      `  ⚠ ${outliers.length} cost outlier(s) flagged (> mean + ${OUTLIER_SIGMA}σ and ≥ ${fmtUSD(OUTLIER_FLOOR)}):`,
    );
    for (const o of outliers) {
      lines.push(
        `    ⚠ ${o.month}  ${o.script}  ${fmtUSD(o.cost)}  (z=${o.z.toFixed(1)}, threshold ${fmtUSD(o.threshold)})`,
      );
    }
  } else {
    lines.push("  ✓ No cost outliers — spend is within normal variance.");
  }
  return lines.join("\n");
}

// ── Main (only when invoked directly) ─────────────────────────────────────────
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const entries = readEntries();
  const { months, scriptMonths } = rollup(entries, {
    windowMonths: WINDOW_MONTHS,
  });
  const outliers = flagOutliers(scriptMonths);

  if (JSON_MODE) {
    console.log(
      JSON.stringify(
        {
          ledger: path.relative(ROOT, LEDGER),
          totalEntries: entries.length,
          windowMonths: WINDOW_MONTHS,
          months: months.map(({ ...m }) => m),
          scriptMonths,
          outliers,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      renderReport({
        months,
        scriptMonths,
        outliers,
        totalEntries: entries.length,
      }),
    );
  }
  process.exit(FAIL_ON_OUTLIER && outliers.length ? 3 : 0);
}

export { billingSurfaceOf, entryCost, entryRealCost, readEntries };
