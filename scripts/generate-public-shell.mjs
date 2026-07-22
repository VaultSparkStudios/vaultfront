#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  generatePublicShellHtml,
  loadPublicShellManifest,
  resolvePublicPage,
} from "./lib/public-shell.mjs";

export function generatePublicShell(root = process.cwd(), write = false) {
  const manifest = loadPublicShellManifest(root);
  const changed = [];
  const seenRoutes = new Set();
  for (const page of manifest.pages ?? []) {
    if (seenRoutes.has(page.route))
      throw new Error(`duplicate route: ${page.route}`);
    seenRoutes.add(page.route);
    const source = resolvePublicPage(root, page.source);
    const before = readFileSync(source, "utf8");
    const after = generatePublicShellHtml(before, manifest);
    if (after !== before) {
      changed.push(path.relative(root, source).replace(/\\/g, "/"));
      if (write) writeFileSync(source, after);
    }
  }
  return {
    ok: write || changed.length === 0,
    mode: write ? "write" : "check",
    changed,
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    const result = generatePublicShell(
      process.cwd(),
      process.argv.includes("--write"),
    );
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
}
