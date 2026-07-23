import { describe, expect, test } from "vitest";
import { extractExpressRoutes } from "../../scripts/lib/route-inventory.mjs";
import { validateMutationRoutePolicies } from "../../scripts/lib/route-policy-coverage.mjs";

const source = `
  app.post(
    "/api/example",
    exampleRateLimit,
    async (request, response) => {
      const actor = await requireActor(request);
      return response.json({ actor });
    },
  );
  app.get("/api/example", (_request, response) => response.json({ ok: true }));
`;

const policy = {
  method: "POST",
  path: "/api/example",
  auth: "verified-actor",
  rateLimit: "exampleRateLimit",
  evidence: "authenticated-event",
  binding: "requireActor",
};

describe("mutation route policy coverage", () => {
  test("extracts multiline Express registrations through the TypeScript AST", () => {
    const routes = extractExpressRoutes(source, "fixture.ts");
    expect(
      routes.map(({ method, path, mutation }) => ({ method, path, mutation })),
    ).toEqual([
      { method: "POST", path: "/api/example", mutation: true },
      { method: "GET", path: "/api/example", mutation: false },
    ]);
  });

  test("accepts exact bidirectional policy coverage", () => {
    const result = validateMutationRoutePolicies(
      extractExpressRoutes(source, "fixture.ts"),
      {
        routes: [policy],
        riskBudget: { publicIngestMax: 0, rationale: "No public ingress." },
      },
    );
    expect(result).toMatchObject({
      ok: true,
      registeredMutations: 1,
      declaredPolicies: 1,
      errors: [],
    });
  });

  test("rejects undeclared, stale, duplicate, unbound, and unrated policies", () => {
    const routes = extractExpressRoutes(source, "fixture.ts");
    const hostile = validateMutationRoutePolicies(routes, {
      routes: [
        { ...policy, binding: "missingActor", rateLimit: "missingRate" },
        { ...policy },
        {
          ...policy,
          path: "/api/stale",
          auth: "public-ingest",
          rationale: "",
        },
      ],
      riskBudget: { publicIngestMax: 0, rationale: "Fixed ceiling." },
    });
    expect(hostile.ok).toBe(false);
    expect(hostile.errors.join("\n")).toMatch(/duplicate policy/);
    expect(hostile.errors.join("\n")).toMatch(/binding marker not present/);
    expect(hostile.errors.join("\n")).toMatch(/rate-limit marker not present/);
    expect(hostile.errors.join("\n")).toMatch(/stale mutation policy/);
    expect(hostile.errors.join("\n")).toMatch(
      /public-ingest requires rationale/,
    );

    const undeclared = validateMutationRoutePolicies(routes, { routes: [] });
    expect(undeclared.errors.join("\n")).toMatch(/undeclared mutation/);
  });

  test("fails closed when unauthenticated ingress exceeds its reviewed budget", () => {
    const result = validateMutationRoutePolicies(
      extractExpressRoutes(source, "fixture.ts"),
      {
        routes: [
          {
            ...policy,
            auth: "public-ingest",
            rationale: "Bounded telemetry intake.",
          },
        ],
        riskBudget: { publicIngestMax: 0, rationale: "No public ingress." },
      },
    );
    expect(result.errors.join("\n")).toMatch(
      /public-ingest risk budget exceeded: 1\/0/,
    );
  });
});
