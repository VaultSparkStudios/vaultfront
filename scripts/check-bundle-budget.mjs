#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseByteLimit(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(kB|MB)$/u.exec(value);
  if (!match) throw new Error(`Invalid bundle limit: ${value}`);
  const multiplier = match[2] === "MB" ? 1024 * 1024 : 1024;
  return Number(match[1]) * multiplier;
}

export function matchesGlob(file, pattern) {
  const escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+?^${}()|[\]\\]/gu, "\\$&")
    .replaceAll("*", "[^/]*");
  return new RegExp(`^${escaped}$`, "u").test(file.replaceAll("\\", "/"));
}

function walk(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? walk(path.join(dir, entry.name), relative)
      : [relative];
  });
}

export function runBundleBudget() {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, ".bundlewatch.json"), "utf8"),
  );
  const files = walk(path.join(root, "static"), "static");
  const failures = [];
  for (const rule of config.files ?? []) {
    const matches = files.filter((file) => matchesGlob(file, rule.path));
    if (matches.length === 0) {
      failures.push(`${rule.path}: no build artifact matched`);
      continue;
    }
    const limit = parseByteLimit(rule.maxSize);
    for (const file of matches) {
      const raw = fs.readFileSync(path.join(root, file));
      const size =
        rule.compression === "gzip" ? gzipSync(raw).byteLength : raw.byteLength;
      const label = `${(size / 1024).toFixed(2)} kB / ${(limit / 1024).toFixed(2)} kB`;
      if (size > limit) failures.push(`${file}: ${label}`);
      else console.log(`bundle budget pass: ${file} (${label})`);
    }
  }
  if (failures.length > 0) {
    console.error("Bundle budget failed:");
    failures.forEach((failure) => console.error(`  - ${failure}`));
    return 1;
  }
  return 0;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) process.exitCode = runBundleBudget();
