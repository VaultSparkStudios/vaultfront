import fs from "fs";
import os from "os";
import path from "path";

const LEDGER = path.join(".cache", "skill-costs.jsonl");
const MANIFEST = path.join(os.homedir(), ".claude", "skills", "MANIFEST.json");

function readManifestSlo(skill) {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    return manifest.skills?.[skill]?.slo || null;
  } catch {
    return null;
  }
}

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
      ? {
          tokenBudget: slo.tokenBudget,
          wallClockMaxSec: slo.wallClockMaxSec,
        }
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
  };
  fs.appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`);
  return entry;
}

export function recentSkillCosts(repoRoot, { skill, limit = 10 } = {}) {
  const ledgerPath = path.join(repoRoot, LEDGER);
  if (!fs.existsSync(ledgerPath)) return [];
  const lines = fs
    .readFileSync(ledgerPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean);
  const parsed = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const filtered = skill
    ? parsed.filter((entry) => entry.skill === skill)
    : parsed;
  return filtered.slice(-limit).reverse();
}

export function priorOverrun(repoRoot, skill) {
  const [entry] = recentSkillCosts(repoRoot, { skill, limit: 1 });
  if (!entry?.overrun || entry.overrun.tokens <= 0) return null;
  return entry;
}
