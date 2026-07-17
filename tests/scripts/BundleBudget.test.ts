import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractInitialEntryAssetPaths,
  matchesGlob,
  measureCompressedAssets,
  measureMediaAssets,
  parseByteLimit,
} from "../../scripts/check-bundle-budget.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("dependency-free bundle budget", () => {
  it("parses binary kilobyte and megabyte limits", () => {
    expect(parseByteLimit("500 kB")).toBe(500 * 1024);
    expect(parseByteLimit("1.8 MB")).toBe(1.8 * 1024 * 1024);
    expect(() => parseByteLimit("500")).toThrow("Invalid bundle limit");
  });

  it("matches the single-star artifact patterns used by the budget", () => {
    expect(
      matchesGlob("static/assets/index-abc.js", "static/assets/index-*.js"),
    ).toBe(true);
    expect(
      matchesGlob("static/assets/vendor-abc.js", "static/assets/index-*.js"),
    ).toBe(false);
  });

  it("roots initial transfer accounting in the built index entry graph", () => {
    const html = [
      '<script type="module" src="/assets/index.js"></script>',
      '<link rel="modulepreload" href="/assets/vendor.js">',
      '<link rel="modulepreload" href="/assets/vendor.js?duplicate">',
      '<script type="module" src="https://cdn.example/external.js"></script>',
      '<script src="/assets/classic.js"></script>',
      '<link rel="modulepreload" href="../escape.js">',
    ].join("");

    expect(extractInitialEntryAssetPaths(html, "static/index.html")).toEqual([
      "static/index.html",
      "static/assets/index.js",
      "static/assets/vendor.js",
    ]);
  });

  it("sums per-resource gzip and Brotli transfer bytes", () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), "vaultfront-budget-"));
    temporaryDirectories.push(projectRoot);
    mkdirSync(path.join(projectRoot, "static", "assets"), { recursive: true });
    const html = Buffer.from("<html>entry</html>");
    const script = Buffer.from("export const value = 'repeat repeat repeat';");
    writeFileSync(path.join(projectRoot, "static", "index.html"), html);
    writeFileSync(
      path.join(projectRoot, "static", "assets", "index.js"),
      script,
    );

    expect(
      measureCompressedAssets(projectRoot, [
        "static/index.html",
        "static/assets/index.js",
      ]),
    ).toEqual({
      gzipBytes: gzipSync(html).byteLength + gzipSync(script).byteLength,
      brotliBytes:
        brotliCompressSync(html).byteLength +
        brotliCompressSync(script).byteLength,
    });
  });

  it("measures only configured media extensions", () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), "vaultfront-media-"));
    temporaryDirectories.push(projectRoot);
    mkdirSync(path.join(projectRoot, "static", "assets"), { recursive: true });
    writeFileSync(
      path.join(projectRoot, "static", "assets", "sound.mp3"),
      "123",
    );
    writeFileSync(
      path.join(projectRoot, "static", "assets", "image.png"),
      "12345",
    );
    writeFileSync(
      path.join(projectRoot, "static", "assets", "code.js"),
      "ignored",
    );

    const measured = measureMediaAssets(projectRoot, "static/assets", [
      ".mp3",
      ".png",
    ]);
    expect(measured.totalBytes).toBe(8);
    expect(measured.maxFileBytes).toBe(5);
    expect(measured.files).toHaveLength(2);
  });
});
