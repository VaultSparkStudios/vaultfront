// sil-forecaster.mjs
// Forecast next-session SIL scores from structured evidence in the append-only
// Markdown ledger. Pure functions stay side-effect free for renderer/tests.

import fs from "node:fs";
import path from "node:path";

const CATEGORIES = [
  "Dev Health",
  "Creative Alignment",
  "Momentum",
  "Engagement",
  "Process Quality",
  "Cross-Repo Coher",
  "Security Posture",
  "Ecosystem Integ",
  "Capital Efficiency",
  "Automation Cover",
];

const CATEGORY_ALIASES = {
  "Cross-Repo Coherence": "Cross-Repo Coher",
  "Ecosystem Integration": "Ecosystem Integ",
  "Automation Coverage": "Automation Cover",
  "Engagement (infra)": "Engagement",
};

function cleanCell(value) {
  return String(value ?? "")
    .replace(/\*\*/gu, "")
    .replace(/`/gu, "")
    .trim();
}

function scoreFromHeading(remainder) {
  const match = String(remainder).match(
    /(?:Total|SIL(?:[^:|()]*)?):\s*(\d+)\/1000/iu,
  );
  return match ? Number(match[1]) : null;
}

function parseCategoryRows(block) {
  const categories = {};
  let total = null;

  for (const line of String(block).split(/\r?\n/u)) {
    if (!/^\s*\|/u.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map(cleanCell);
    if (cells.length < 2) continue;

    const indexed = /^\d+$/u.test(cells[0]);
    const category = indexed ? cells[1] : cells[0];
    const scoreCell = indexed ? cells[2] : cells[1];
    if (!category || !scoreCell) continue;

    if (/^Total$/iu.test(category)) {
      const totalMatch = scoreCell.match(/^(\d+)\/1000$/u);
      if (totalMatch) total = Number(totalMatch[1]);
      continue;
    }

    const scoreMatch = scoreCell.match(/^(\d{1,3})$/u);
    if (!scoreMatch) continue;
    const canonical = CATEGORY_ALIASES[category] || category;
    if (!CATEGORIES.includes(canonical)) continue;
    categories[canonical] = Number(scoreMatch[1]);
  }

  return { categories, total };
}

export function parseSilHistory(silText, maxSessions = 5) {
  const headingRe =
    /^## (?:Sprint:\s*)?(\d{4}-\d{2}-\d{2})\s+—\s+Session\s+(\d+)([^\n]*)/gmu;
  const physical = [];
  let match;

  while ((match = headingRe.exec(String(silText))) !== null) {
    physical.push({
      date: match[1],
      session: Number(match[2]),
      total: scoreFromHeading(match[3]),
      idx: match.index,
    });
  }

  for (let index = 0; index < physical.length; index += 1) {
    const current = physical[index];
    const end = physical[index + 1]?.idx ?? String(silText).length;
    const parsed = parseCategoryRows(String(silText).slice(current.idx, end));
    current.categories = parsed.categories;
    current.total ??= parsed.total;
  }

  return physical
    .filter((session) => Number.isFinite(session.total))
    .sort(
      (a, b) =>
        b.session - a.session || b.date.localeCompare(a.date) || b.idx - a.idx,
    )
    .slice(0, Math.max(0, maxSessions));
}

export function forecastNext(sessions, signals = {}) {
  if (!sessions.length) return null;
  const forecast = {};

  for (const category of CATEGORIES) {
    const series = sessions
      .map((session) => session.categories?.[category])
      .filter((score) => typeof score === "number");
    if (!series.length) {
      forecast[category] = { predicted: null, confidence: "none" };
      continue;
    }

    const last = series[0];
    const previous = series[1] ?? last;
    let delta = last - previous;
    if (category === "Momentum" && signals.velocity != null) {
      delta += signals.velocity >= 10 ? 2 : signals.velocity <= 2 ? -5 : 0;
    }
    if (category === "Security Posture" && signals.blockerPressure >= 80) {
      delta -= 2;
    }
    if (category === "Capital Efficiency" && signals.contextAge >= 7) {
      delta -= 1;
    }

    const predicted = Math.max(0, Math.min(100, last + 0.6 * delta));
    forecast[category] = {
      predicted: Math.round(predicted),
      delta: Math.round(predicted - last),
      confidence: series.length >= 3 ? "medium" : "low",
    };
  }

  const predicted = Object.values(forecast).filter(
    (entry) => entry.predicted != null,
  );
  if (!predicted.length) return null;

  return {
    categories: forecast,
    totalPredicted: predicted.reduce((sum, entry) => sum + entry.predicted, 0),
    basis: sessions.length,
  };
}

export function renderForecastBlock(forecast, currentTotal = null) {
  if (!forecast) return "";
  const lines = [
    "╔══ SIL FORECAST (next session) ═════════════════════════════════╗",
  ];
  const arrow = (delta) => (delta > 0 ? "↑" : delta < 0 ? "↓" : "→");
  if (currentTotal != null) {
    const diff = forecast.totalPredicted - currentTotal;
    lines.push(
      `║  Projected total: ${forecast.totalPredicted}/1000  (${arrow(diff)}${Math.abs(diff)} vs current ${currentTotal})`.padEnd(
        67,
      ) + "║",
    );
  } else {
    lines.push(
      `║  Projected total: ${forecast.totalPredicted}/1000`.padEnd(67) + "║",
    );
  }
  const risky = Object.entries(forecast.categories)
    .filter(([, entry]) => entry.delta != null && entry.delta <= -3)
    .sort((a, b) => a[1].delta - b[1].delta)
    .slice(0, 3);
  if (risky.length) {
    lines.push("║".padEnd(67) + "║");
    lines.push("║  At-risk categories (forecast drop ≥3):".padEnd(67) + "║");
    for (const [category, entry] of risky) {
      lines.push(
        `║    ↓ ${category.padEnd(22)} ${entry.predicted} (Δ${entry.delta})`.padEnd(
          67,
        ) + "║",
      );
    }
  } else {
    lines.push("║  All categories forecast stable or rising.".padEnd(67) + "║");
  }
  lines.push(
    "╚════════════════════════════════════════════════════════════════╝",
  );
  return lines.join("\n");
}

if (
  import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
  process.argv[1].endsWith("sil-forecaster.mjs")
) {
  const root = process.cwd();
  const silPath = path.join(root, "context", "SELF_IMPROVEMENT_LOOP.md");
  const sil = fs.readFileSync(silPath, "utf8");
  const sessions = parseSilHistory(sil);
  const last = sessions[0];
  const forecast = forecastNext(sessions, {
    velocity: 11,
    blockerPressure: 87,
    contextAge: 0,
  });
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          basis: sessions.map((session) => ({
            session: session.session,
            total: session.total,
          })),
          forecast,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(renderForecastBlock(forecast, last?.total));
  }
}
