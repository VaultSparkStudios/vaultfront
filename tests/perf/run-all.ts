import { globSync } from "glob";
import path from "node:path";
import { spawnSync } from "../../scripts/lib/safe-spawn.mjs";

// "perf": "npx tsx tests/perf/*.ts" doesn't work on Windows
const files = globSync("tests/perf/*.ts").filter((f) => !f.includes("run-all"));
for (const file of files) {
  console.log(`\nRunning ${file}...`);
  const result = spawnSync(
    process.execPath,
    [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve(file)],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(
      `Performance probe failed for ${file} (exit ${result.status})`,
    );
  }
}
