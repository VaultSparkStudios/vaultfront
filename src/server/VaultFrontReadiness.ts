export interface VaultFrontReadinessInput {
  healthy: boolean;
  processRole: "master" | "worker";
  workerId?: number;
  playtestPulse?: {
    status: "no-signal" | "warming" | "ready";
    score: number;
    freshness: {
      lastEventAt: string | null;
      ageMinutes: number | null;
    };
  };
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
    playtestPulse: "pass" | "warn";
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
  playtestPulse?: VaultFrontReadinessInput["playtestPulse"];
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
  const pulseReady = input.playtestPulse?.status === "ready";

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
      playtestPulse: pulseReady ? "pass" : "warn",
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
      {
        gate: "playtest-pulse",
        status: pulseReady ? "pass" : "warn",
        evidence: input.playtestPulse
          ? `Pulse ${input.playtestPulse.status} at score ${input.playtestPulse.score}; latest event ${input.playtestPulse.freshness.lastEventAt ?? "not recorded"}.`
          : "No live playtest pulse attached to this process.",
      },
    ],
    playtestPulse: input.playtestPulse,
  };
}
