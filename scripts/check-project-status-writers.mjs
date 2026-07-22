#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CANONICAL_WRITER = path.normalize("scripts/lib/write-project-status.mjs");

export function analyzeProjectStatusWriterSource(source) {
  const variables = new Set();
  const assignment =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*PROJECT_STATUS\.json[^;\n]*/g;
  for (const match of source.matchAll(assignment)) variables.add(match[1]);

  const findings = [];
  const writeCall =
    /\b(?:fs\.)?(writeFileSync|writeFile|renameSync|rename)\s*\(\s*([^,\n)]+)/g;
  for (const match of source.matchAll(writeCall)) {
    const target = match[2].trim();
    const directLiteral = /PROJECT_STATUS\.json/.test(target);
    const directVariable = [...variables].some((variable) =>
      new RegExp(`^${variable}(?:\\b|\\.)`).test(target),
    );
    if (!directLiteral && !directVariable) continue;
    findings.push({
      operation: match[1],
      target,
      offset: match.index ?? 0,
    });
  }
  return findings;
}

function walkScripts(root) {
  const directory = path.join(root, "scripts");
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.(?:mjs|js|cjs)$/.test(entry.name)) {
        files.push(absolute);
      }
    }
  };
  visit(directory);
  return files;
}

export function checkProjectStatusWriters(root = process.cwd()) {
  const findings = [];
  for (const absolute of walkScripts(root)) {
    const relative = path.normalize(path.relative(root, absolute));
    if (relative === CANONICAL_WRITER) continue;
    const source = fs.readFileSync(absolute, "utf8");
    for (const finding of analyzeProjectStatusWriterSource(source)) {
      const line = source.slice(0, finding.offset).split(/\r?\n/).length;
      findings.push({
        file: relative.replaceAll("\\", "/"),
        line,
        ...finding,
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const rootIndex = process.argv.indexOf("--root");
  const root =
    rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : process.cwd();
  const result = checkProjectStatusWriters(root);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(
      "PASS project-status writer: all mutations use the canonical atomic writer",
    );
  } else {
    console.error("FAIL project-status writer bypasses detected:");
    for (const finding of result.findings) {
      console.error(
        `  ${finding.file}:${finding.line} ${finding.operation}(${finding.target})`,
      );
    }
  }
  process.exit(result.ok ? 0 : 1);
}
