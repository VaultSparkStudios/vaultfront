#!/usr/bin/env node
import fs from "fs";
import path from "path";

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function findStudioRoot(startPath) {
  const candidates = [
    startPath,
    path.dirname(startPath),
    path.resolve(startPath, "..", "vaultspark-studio-ops"),
    path.resolve(startPath, "..", "VaultSparkStudioOps"),
  ];
  return candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "portfolio", "PROJECT_REGISTRY.json")),
  );
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function summarizeTaskBoard(project, repoPath, currentRepoPath) {
  const taskBoardPath = path.join(repoPath, "context", "TASK_BOARD.md");
  const text = readText(taskBoardPath);
  const present = text.length > 0;
  const openText = text.split(/^## Completed\b/im)[0] ?? text;
  const bullets = openText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) && !/~~/.test(line));
  const blocked = bullets.filter((line) =>
    /human action required|blocked|missing|credential/i.test(line),
  ).length;
  const critical = bullets.filter((line) =>
    /\b(P0|critical|launch)\b/i.test(line),
  ).length;
  const high = bullets.filter((line) => /\b(P1|high|now)\b/i.test(line)).length;

  return {
    project,
    repoPath,
    current:
      path.resolve(repoPath).toLowerCase() ===
      path.resolve(currentRepoPath).toLowerCase(),
    present,
    remaining: bullets.length,
    unblocked: Math.max(0, bullets.length - blocked),
    blocked,
    critical,
    high,
    completed: countMatches(text, /^[-*]\s+~~/gm),
  };
}

function registryEntries(registry) {
  if (Array.isArray(registry)) return registry;
  if (Array.isArray(registry?.projects)) return registry.projects;
  if (registry && typeof registry === "object") {
    return Object.entries(registry).map(([slug, value]) => ({
      slug,
      ...value,
    }));
  }
  return [];
}

export function loadPortfolioTaskBoards({ studioRoot, currentRepoPath }) {
  const root = findStudioRoot(studioRoot) ?? studioRoot;
  const registryPath = path.join(root, "portfolio", "PROJECT_REGISTRY.json");
  const registryText = readText(registryPath);
  if (!registryText) {
    return null;
  }

  let registry;
  try {
    registry = JSON.parse(registryText);
  } catch {
    return null;
  }

  const byProject = [];
  for (const entry of registryEntries(registry)) {
    const slug = entry.slug ?? entry.name ?? entry.project ?? "unknown";
    const rawPath = entry.path ?? entry.repoPath ?? entry.localPath;
    const repoPath = rawPath
      ? path.resolve(root, rawPath)
      : path.resolve(path.dirname(root), slug);
    byProject.push(summarizeTaskBoard(slug, repoPath, currentRepoPath));
  }

  const totals = byProject.reduce(
    (acc, project) => {
      acc.remaining += project.remaining;
      acc.unblocked += project.unblocked;
      acc.blocked += project.blocked;
      acc.critical += project.critical;
      acc.high += project.high;
      return acc;
    },
    { remaining: 0, unblocked: 0, blocked: 0, critical: 0, high: 0 },
  );

  return {
    totals,
    byProject,
    projectsScanned: byProject.length,
    projectsWithWork: byProject.filter((project) => project.remaining > 0)
      .length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = loadPortfolioTaskBoards({
    studioRoot: process.cwd(),
    currentRepoPath: process.cwd(),
  });
  console.log(JSON.stringify(result, null, 2));
}
