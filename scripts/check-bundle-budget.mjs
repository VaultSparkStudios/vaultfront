#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseByteLimit(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*(kB|MB)$/u.exec(value);
  if (!match) throw new Error(`Invalid bundle limit: ${value}`);
  const multiplier = match[2] === "MB" ? 1024 * 1024 : 1024;
  return Number(match[1]) * multiplier;
}

export function effectiveByteLimit(baselineBytes, variancePercent = 0) {
  if (!Number.isFinite(baselineBytes) || baselineBytes < 0) {
    throw new Error(`Invalid byte baseline: ${baselineBytes}`);
  }
  if (!Number.isFinite(variancePercent) || variancePercent < 0) {
    throw new Error(`Invalid cross-platform variance: ${variancePercent}`);
  }
  return Math.ceil(baselineBytes * (1 + variancePercent / 100));
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

function htmlAttribute(tag, name) {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "iu",
  ).exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

export function extractInitialEntryAssetPaths(
  html,
  htmlPath = "static/index.html",
) {
  const normalizedHtmlPath = htmlPath.replaceAll("\\", "/");
  const buildRoot = path.posix.dirname(normalizedHtmlPath);
  const assets = new Set([normalizedHtmlPath]);

  for (const match of html.matchAll(/<(script|link)\b[^>]*>/giu)) {
    const tagName = match[1].toLowerCase();
    const tag = match[0];
    let reference = null;

    if (
      tagName === "script" &&
      htmlAttribute(tag, "type")?.toLowerCase() === "module"
    ) {
      reference = htmlAttribute(tag, "src");
    } else if (tagName === "link") {
      const relations = (htmlAttribute(tag, "rel") ?? "")
        .toLowerCase()
        .split(/\s+/u);
      if (relations.includes("modulepreload")) {
        reference = htmlAttribute(tag, "href");
      }
    }

    if (!reference || /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(reference)) {
      continue;
    }

    const localReference = reference.split(/[?#]/u, 1)[0];
    const candidate = path.posix.normalize(
      localReference.startsWith("/")
        ? path.posix.join(buildRoot, localReference.slice(1))
        : path.posix.join(buildRoot, localReference),
    );
    if (candidate === buildRoot || candidate.startsWith(`${buildRoot}/`)) {
      assets.add(candidate);
    }
  }

  return [...assets];
}

export function measureCompressedAssets(projectRoot, assetPaths) {
  return assetPaths.reduce(
    (totals, assetPath) => {
      const raw = fs.readFileSync(path.join(projectRoot, assetPath));
      totals.gzipBytes += gzipSync(raw).byteLength;
      totals.brotliBytes += brotliCompressSync(raw).byteLength;
      return totals;
    },
    { gzipBytes: 0, brotliBytes: 0 },
  );
}

export function measureMediaAssets(projectRoot, mediaRoot, extensions) {
  const normalizedExtensions = new Set(
    extensions.map((extension) => extension.toLowerCase()),
  );
  const files = walk(path.join(projectRoot, mediaRoot), mediaRoot).filter(
    (file) => normalizedExtensions.has(path.extname(file).toLowerCase()),
  );
  const sizes = files.map((file) => ({
    file,
    bytes: fs.statSync(path.join(projectRoot, file)).size,
  }));
  return {
    files: sizes,
    totalBytes: sizes.reduce((sum, item) => sum + item.bytes, 0),
    maxFileBytes: sizes.reduce(
      (largest, item) => Math.max(largest, item.bytes),
      0,
    ),
  };
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
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
      const label = `${formatBytes(size)} / ${formatBytes(limit)}`;
      if (size > limit) failures.push(`${file}: ${label}`);
      else console.log(`bundle budget pass: ${file} (${label})`);
    }
  }

  if (config.initialEntry) {
    const htmlPath = config.initialEntry.html;
    const html = fs.readFileSync(path.join(root, htmlPath), "utf8");
    const assetPaths = extractInitialEntryAssetPaths(html, htmlPath);
    const measured = measureCompressedAssets(root, assetPaths);
    const variance = config.initialEntry.crossPlatformVariancePercent ?? 0;
    const gzipBaseline =
      config.initialEntry.baselineGzipBytes ?? config.initialEntry.maxGzipBytes;
    const brotliBaseline =
      config.initialEntry.baselineBrotliBytes ??
      config.initialEntry.maxBrotliBytes;
    const checks = [
      ["gzip", measured.gzipBytes, gzipBaseline],
      ["brotli", measured.brotliBytes, brotliBaseline],
    ];
    for (const [encoding, bytes, baseline] of checks) {
      const limit = effectiveByteLimit(baseline, variance);
      const varianceLabel = variance
        ? `; baseline ${baseline} bytes + ${variance}% platform variance`
        : "";
      const label = `${formatBytes(bytes)} (${bytes} bytes) / ${formatBytes(limit)} (${limit} bytes${varianceLabel})`;
      if (bytes > limit) {
        failures.push(`initial entry ${encoding}: ${label}`);
      } else {
        console.log(
          `bundle budget pass: initial entry ${encoding} (${label}; ${assetPaths.length} files)`,
        );
      }
    }
  }

  if (config.media) {
    const measured = measureMediaAssets(
      root,
      config.media.root,
      config.media.extensions,
    );
    if (measured.files.length === 0) {
      failures.push(`${config.media.root}: no media artifact matched`);
    } else {
      const totalLabel = `${formatBytes(measured.totalBytes)} / ${formatBytes(config.media.maxTotalBytes)}`;
      const largestLabel = `${formatBytes(measured.maxFileBytes)} / ${formatBytes(config.media.maxFileBytes)}`;
      if (measured.totalBytes > config.media.maxTotalBytes) {
        failures.push(`media aggregate: ${totalLabel}`);
      } else {
        console.log(
          `bundle budget pass: media aggregate (${totalLabel}; ${measured.files.length} files)`,
        );
      }
      if (measured.maxFileBytes > config.media.maxFileBytes) {
        failures.push(`largest media artifact: ${largestLabel}`);
      } else {
        console.log(
          `bundle budget pass: largest media artifact (${largestLabel})`,
        );
      }
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
