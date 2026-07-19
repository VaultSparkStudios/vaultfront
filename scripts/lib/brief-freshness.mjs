import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const BRIEF_SOURCE_SCHEMA = 1;
export const BRIEF_SOURCE_FILES = Object.freeze([
  "context/PROJECT_STATUS.json",
  "context/TASK_BOARD.md",
  "context/LATEST_HANDOFF.md",
  "context/SELF_IMPROVEMENT_LOOP.md",
  "docs/GENIUS_LIST.md",
]);

function digest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function readRequired(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sessionNumbers(source) {
  return [...String(source).matchAll(/\bSession\s+(\d+)\b/gi)].map((match) =>
    Number(match[1]),
  );
}

export function buildBriefSourceManifest(root) {
  const sources = Object.fromEntries(
    BRIEF_SOURCE_FILES.map((relativePath) => {
      const body = readRequired(root, relativePath);
      return [relativePath, digest(body)];
    }),
  );
  const status = JSON.parse(readRequired(root, "context/PROJECT_STATUS.json"));
  const sessions = [Number(status.currentSession) || 0];
  for (const relativePath of [
    "context/TASK_BOARD.md",
    "context/LATEST_HANDOFF.md",
    "context/SELF_IMPROVEMENT_LOOP.md",
  ]) {
    sessions.push(...sessionNumbers(readRequired(root, relativePath)));
  }
  return {
    schema: BRIEF_SOURCE_SCHEMA,
    session: Math.max(...sessions),
    sources,
  };
}

export function parseBriefSourceManifest(brief) {
  const match = String(brief).match(
    /<!--\s*brief-sources:\s*(\{[^\n]+\})\s*-->/,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return { invalid: true };
  }
}

export function evaluateBriefSourceFreshness(root, brief) {
  const embedded = parseBriefSourceManifest(brief);
  if (!embedded) {
    return { fresh: false, reason: "brief source manifest missing" };
  }
  if (embedded.invalid || embedded.schema !== BRIEF_SOURCE_SCHEMA) {
    return {
      fresh: false,
      reason: "brief source manifest invalid or unsupported",
    };
  }
  let current;
  try {
    current = buildBriefSourceManifest(root);
  } catch (error) {
    return {
      fresh: false,
      reason: `brief source read failed: ${error.message}`,
    };
  }
  if (embedded.session !== current.session) {
    return {
      fresh: false,
      reason: `source session drift: brief S${embedded.session}, current S${current.session}`,
    };
  }
  const changed = BRIEF_SOURCE_FILES.filter(
    (relativePath) =>
      embedded.sources?.[relativePath] !== current.sources[relativePath],
  );
  if (changed.length > 0) {
    return {
      fresh: false,
      reason: `source hash drift: ${changed.join(", ")}`,
      changed,
    };
  }
  return { fresh: true, reason: "source-coherent", manifest: current };
}
