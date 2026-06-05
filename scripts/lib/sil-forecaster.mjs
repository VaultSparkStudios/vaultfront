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

export function parseSilHistory(silText, maxSessions = 5) {
  const sessionRe =
    /^## (\d{4}-\d{2}-\d{2}) — Session (\d+)[^\n]*Total: (\d+)\/1000/gm;
  const sessions = [];
  let match;
  while ((match = sessionRe.exec(silText)) !== null) {
    sessions.push({
      date: match[1],
      session: Number(match[2]),
      total: Number(match[3]),
      idx: match.index,
    });
    if (sessions.length >= maxSessions) break;
  }

  for (let i = 0; i < sessions.length; i++) {
    const start = sessions[i].idx;
    const end = i + 1 < sessions.length ? sessions[i + 1].idx : silText.length;
    const block = silText.slice(start, end);
    const categories = {};
    const rowRe = /^\|\s*\d+\s*\|\s*([A-Za-z][^|]+?)\s*\|\s*(\d+)\s*\|/gm;
    let row;
    while ((row = rowRe.exec(block)) !== null) {
      const raw = row[1].trim();
      categories[CATEGORY_ALIASES[raw] || raw] = Number(row[2]);
    }
    sessions[i].categories = categories;
  }

  return sessions;
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
    const prior = series[1] ?? last;
    let delta = last - prior;
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

  const totalPredicted = Object.values(forecast)
    .filter((item) => item.predicted != null)
    .reduce((sum, item) => sum + item.predicted, 0);
  return { categories: forecast, totalPredicted, basis: sessions.length };
}
