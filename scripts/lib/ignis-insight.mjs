import fs from "fs";
import path from "path";

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

export function loadIgnisInsight({ studioRoot }) {
  const candidates = [
    path.join(studioRoot, "ignis", "INSIGHT.json"),
    path.join(studioRoot, ".cache", "ignis-insight.json"),
    path.join(studioRoot, "portfolio", "IGNIS_INSIGHT.json"),
  ];
  const json = candidates.map(readJson).find(Boolean);
  if (json) {
    return {
      present: true,
      generated: json.generatedAt ?? json.generated ?? null,
      daysSinceSynth: json.daysSinceSynth ?? "?",
      phase: json.phase ?? json.regime ?? "",
      avgIq: json.avgIq ?? json.averageIq ?? null,
      coverage: json.coverage ?? json.signalCoverage ?? null,
      topProject: json.topProject ?? json.project ?? null,
      topRisk: json.topRisk ?? json.risk ?? null,
      truthMix: json.truthMix ?? json.truth ?? null,
      firstAction: json.firstAction ?? json.nextAction ?? null,
      summaryLead: json.summaryLead ?? json.summary ?? null,
    };
  }

  const markdown = readText(path.join(studioRoot, "ignis", "INSIGHT.md"));
  if (!markdown) {
    return { present: false };
  }

  return {
    present: true,
    generated: markdown.match(/generated(?:-at)?:\s*([^\n]+)/i)?.[1]?.trim(),
    daysSinceSynth: "?",
    phase: markdown.match(/phase:\s*([^\n]+)/i)?.[1]?.trim(),
    summaryLead: markdown
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")),
  };
}
