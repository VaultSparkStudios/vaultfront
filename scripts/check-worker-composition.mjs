#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Session 81 convergence floor: the root is currently 4,029 physical lines.
// Eleven lines of headroom make growth an explicit architectural decision.
export const WORKER_LINE_BUDGET = 4040;
export const ROUTER_LINE_BUDGET = 180;

export const EXTRACTED_DOMAINS = [
  {
    router: "SeasonContractRouter.ts",
    registration: "registerSeasonContractRoutes",
    forbiddenInWorker: "/api/vaultfront/contracts",
  },
  {
    router: "LoopEvidenceRouter.ts",
    registration: "registerLoopEvidenceRoutes",
    forbiddenInWorker: "/api/vaultfront/funnel",
  },
  {
    router: "PredictionLeagueRouter.ts",
    registration: "registerPredictionLeagueRoutes",
    forbiddenInWorker: "/api/vaultfront/prediction-league",
  },
];

const lineCount = (source) => source.split(/\r?\n/).length;

export function inspectWorkerComposition(root = process.cwd()) {
  const serverDir = path.join(root, "src", "server");
  const worker = fs.readFileSync(path.join(serverDir, "Worker.ts"), "utf8");
  const errors = [];
  const workerLines = lineCount(worker);
  if (workerLines > WORKER_LINE_BUDGET) {
    errors.push(
      `Worker.ts line budget exceeded: ${workerLines}/${WORKER_LINE_BUDGET}`,
    );
  }
  const routers = EXTRACTED_DOMAINS.map((domain) => {
    const source = fs.readFileSync(path.join(serverDir, domain.router), "utf8");
    const lines = lineCount(source);
    if (lines > ROUTER_LINE_BUDGET) {
      errors.push(
        `${domain.router} line budget exceeded: ${lines}/${ROUTER_LINE_BUDGET}`,
      );
    }
    if (!worker.includes(domain.registration)) {
      errors.push(`Worker.ts does not compose ${domain.registration}`);
    }
    if (worker.includes(domain.forbiddenInWorker)) {
      errors.push(
        `Worker.ts reclaimed extracted route ${domain.forbiddenInWorker}`,
      );
    }
    return { file: domain.router, lines };
  });
  return {
    ok: errors.length === 0,
    worker: { lines: workerLines, budget: WORKER_LINE_BUDGET },
    routers,
    routerBudget: ROUTER_LINE_BUDGET,
    errors,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = inspectWorkerComposition();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
