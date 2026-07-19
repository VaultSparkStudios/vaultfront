#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function checkFooterManifest(root = process.cwd()) {
  const manifestPath = resolve(root, "public/footer-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const errors = [];
  const seenRoutes = new Set();
  for (const page of manifest.pages ?? []) {
    if (seenRoutes.has(page.route))
      errors.push(`${page.route}: duplicate route`);
    seenRoutes.add(page.route);
    let html = "";
    try {
      html = readFileSync(resolve(root, page.source), "utf8");
    } catch {
      errors.push(`${page.route}: missing source ${page.source}`);
      continue;
    }
    if (!/<nav(?:\s|>)/i.test(html))
      errors.push(`${page.route}: missing navigation`);
    if (!/<footer(?:\s|>)/i.test(html))
      errors.push(`${page.route}: missing footer`);
    if (!html.includes(manifest.brandHref))
      errors.push(`${page.route}: missing brand link`);
    if (!html.includes(manifest.copyright))
      errors.push(`${page.route}: missing copyright`);
    for (const href of manifest.requiredLinks ?? []) {
      if (!html.includes(`href="${href}"`))
        errors.push(`${page.route}: missing ${href}`);
    }
  }
  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    manifest: "public/footer-manifest.json",
    pageCount: manifest.pages?.length ?? 0,
    errors,
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const result = checkFooterManifest();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
