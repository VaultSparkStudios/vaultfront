import fs from "fs";
import path from "path";

const LEDGER_REL = path.join("context", "human-action-ages.json");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function daysSince(dateIso, now = new Date()) {
  const then = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

function readLedger(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

export function ensureAges(taskBoard, { root }) {
  const ledgerPath = path.join(root, LEDGER_REL);
  const ledger = readLedger(ledgerPath);
  const currentTitles = taskBoard
    .split(/\r?\n/)
    .filter((line) => /^- \[ \]/.test(line))
    .map((line) =>
      line
        .replace(/^- \[ \]\s*/, "")
        .replace(/\*\*/g, "")
        .split(/\s+--\s+|\s+—\s+/)[0]
        .trim(),
    )
    .filter(Boolean);

  let changed = false;
  const today = todayIso();
  for (const title of currentTitles) {
    if (!ledger[title]) {
      ledger[title] = { firstSeen: today };
      changed = true;
    }
  }

  if (changed) {
    try {
      fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
      fs.writeFileSync(`${ledgerPath}.tmp`, JSON.stringify(ledger, null, 2));
      fs.renameSync(`${ledgerPath}.tmp`, ledgerPath);
    } catch {
      return ledger;
    }
  }

  return ledger;
}
