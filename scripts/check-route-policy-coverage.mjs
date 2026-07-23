#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { extractExpressRoutes } from "./lib/route-inventory.mjs";
import { validateMutationRoutePolicies } from "./lib/route-policy-coverage.mjs";

const root = process.cwd();
const catalogPath = path.join(root, "config", "mutation-route-policies.json");
const serverDir = path.join(root, "src", "server");
const routeFiles = fs
  .readdirSync(serverDir)
  .filter((name) => name === "Worker.ts" || name.endsWith("Router.ts"))
  .map((name) => path.join(serverDir, name));
const routes = routeFiles.flatMap((file) =>
  extractExpressRoutes(fs.readFileSync(file, "utf8"), file).map((route) => ({
    ...route,
    sourceFile: path.relative(root, file).replaceAll("\\", "/"),
  })),
);
const mutations = routes.filter((route) => route.mutation);

if (process.argv.includes("--inventory")) {
  console.log(
    JSON.stringify(
      mutations.map(({ method, path, line, registration, sourceFile }) => ({
        method,
        path,
        line,
        sourceFile,
        authMarkers: [
          "requireVaultFrontActor",
          "resolveAuthenticatedActorKey",
          "resolveVaultFrontIdentity",
          "authorizeRoutePolicy",
          "verifyClientToken",
          "adminToken",
          "verifyResultCertificate",
        ].filter((marker) => registration.includes(marker)),
        rateMarkers: [
          ...registration.matchAll(/\b([A-Za-z][A-Za-z0-9]*RateLimit)\b/g),
        ]
          .map((match) => match[1])
          .filter((value, index, values) => values.indexOf(value) === index),
      })),
      null,
      2,
    ),
  );
  process.exit(0);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const result = validateMutationRoutePolicies(routes, catalog);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
