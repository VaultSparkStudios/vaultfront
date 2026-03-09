import { copyFile, access } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("static");
const indexPath = path.join(outDir, "index.html");
const notFoundPath = path.join(outDir, "404.html");

try {
  await access(indexPath);
  await copyFile(indexPath, notFoundPath);
  console.log("Copied static/index.html to static/404.html for SPA routing.");
} catch (error) {
  console.error("postbuild-pages failed:", error);
  process.exit(1);
}
