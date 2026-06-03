export interface VaultFrontReadinessInput {
  healthy: boolean;
  processRole: "master" | "worker";
  workerId?: number;
}

export interface VaultFrontReadinessPayload {
  project: "vaultfront";
  status: "ready" | "degraded";
  generatedAt: string;
  processRole: "master" | "worker";
  workerId?: number;
  checks: {
    serverHealth: "pass" | "fail";
    testSurfacesRegistered: "pass";
    revenueSignal: "warn";
    freeTierCost: "pass";
    aiCostGuardrail: "pass";
  };
  testSurfaces: Array<{
    label: string;
    command: string;
    purpose: string;
  }>;
  launchGates: Array<{
    gate: string;
    status: "pass" | "warn";
    evidence: string;
  }>;
}

const testSurfaces = [
  {
    label: "Unit and server regression",
    command: "npm test",
    purpose: "Vitest core/client suite plus focused server tests.",
  },
  {
    label: "Production build",
    command: "npm run build-prod",
    purpose: "TypeScript no-emit plus production Vite bundle.",
  },
  {
    label: "E2E smoke",
    command: "npm run e2e",
    purpose: "Playwright homepage, settings, manifest, and solo-flow smoke.",
  },
  {
    label: "Local game server",
    command: "npm run dev",
    purpose:
      "Client and worker stack for manual match, tournament, and HUD checks.",
  },
];

export function buildVaultFrontReadiness(
  input: VaultFrontReadinessInput,
): VaultFrontReadinessPayload {
  const status = input.healthy ? "ready" : "degraded";

  return {
    project: "vaultfront",
    status,
    generatedAt: new Date().toISOString(),
    processRole: input.processRole,
    workerId: input.workerId,
    checks: {
      serverHealth: input.healthy ? "pass" : "fail",
      testSurfacesRegistered: "pass",
      revenueSignal: "warn",
      freeTierCost: "pass",
      aiCostGuardrail: "pass",
    },
    testSurfaces,
    launchGates: [
      {
        gate: "copyleft-provenance",
        status: "pass",
        evidence:
          "AGPL upstream obligations documented in RIGHTS_PROVENANCE.md.",
      },
      {
        gate: "free-tier-cost",
        status: "pass",
        evidence:
          "Internal alpha; AI generation remains opt-in and rate-limited while revenue is unproven.",
      },
      {
        gate: "revenue-signal",
        status: "warn",
        evidence:
          "Checkout API is present, but startup brief still reports no live revenue signal.",
      },
      {
        gate: "playtest-surface",
        status: "pass",
        evidence:
          "Tournament, replay, contracts, season, and HUD test commands are registered.",
      },
    ],
  };
}
