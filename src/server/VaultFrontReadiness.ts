import { remoteAiPosture, type RemoteAiPosture } from "./RemoteAiPolicy";
import {
  getReplayIntegrityPosture,
  type ReplayIntegrityPosture,
} from "./ReplayStore";

export type ReadinessEvidenceStatus = "declared" | "verified" | "missing";

export interface RuntimeHealthEvidence {
  scope: "process-local-worker" | "declared-only";
  httpRequest: "responding" | "unverified";
  ipcConnected: boolean | null;
  ipcWatermark: {
    healthy: boolean;
    lastMasterMessageAt: number;
    ageMs: number;
    maxAgeMs: number;
  } | null;
  gameLoop: {
    healthy: boolean;
    lastTickCompletedAt: number;
    ageMs: number;
    maxAgeMs: number;
  } | null;
}

export interface VaultFrontReadinessInput {
  healthy: boolean;
  processRole: "master" | "worker";
  workerId?: number;
  healthEvidence?: RuntimeHealthEvidence;
  revenueSignal?: {
    status: "unverified" | "observed";
    observedAt?: string;
  };
  replayIntegrity?: ReplayIntegrityPosture;
  remoteAi?: RemoteAiPosture;
  rightsEvidence?: {
    status: ReadinessEvidenceStatus;
    path: string;
  };
  verification?: {
    tests?: { status: ReadinessEvidenceStatus; observedAt?: string };
    productionBuild?: { status: ReadinessEvidenceStatus; observedAt?: string };
  };
  playtestPulse?: {
    status: "no-signal" | "warming" | "ready";
    score: number;
    freshness: {
      lastEventAt: string | null;
      ageMinutes: number | null;
    };
    actionInsights?: string[];
    alphaGate?: {
      status: "not-started" | "warming" | "blocked" | "ready";
      passLabel: string;
      nextCheck: string;
    };
  };
}

export interface VaultFrontReadinessPayload {
  project: "vaultfront";
  /** Compatibility alias for serverStatus. It never implies release-ready. */
  status: "ready" | "degraded";
  serverStatus: "ready" | "degraded";
  releaseStatus: "ready" | "warning" | "blocked";
  generatedAt: string;
  processRole: "master" | "worker";
  workerId?: number;
  healthEvidence: RuntimeHealthEvidence;
  checks: {
    serverHealth: "pass" | "fail";
    testSurfacesRegistered: "declared" | "verified";
    revenueSignal: "pass" | "warn";
    freeTierCost: "verified";
    aiCostGuardrail: "verified";
    playtestPulse: "pass" | "warn";
    replayIntegrity: "pass" | "warn" | "fail";
    rightsProvenance: "pass" | "warn" | "fail";
  };
  evidence: {
    declared: string[];
    verified: string[];
    missing: string[];
  };
  releaseBlockers: string[];
  releaseWarnings: string[];
  testSurfaces: Array<{
    label: string;
    command: string;
    purpose: string;
    evidenceStatus: "declared" | "verified";
  }>;
  launchGates: Array<{
    gate: string;
    status: "pass" | "warn" | "block";
    evidence: string;
  }>;
  playtestPulse?: VaultFrontReadinessInput["playtestPulse"];
  remoteAi: RemoteAiPosture;
}

const declaredTestSurfaces = [
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
  const serverStatus = input.healthy ? "ready" : "degraded";
  const healthEvidence = input.healthEvidence ?? {
    scope: "declared-only" as const,
    httpRequest: "unverified" as const,
    ipcConnected: null,
    ipcWatermark: null,
    gameLoop: null,
  };
  const pulseReady =
    input.playtestPulse?.status === "ready" &&
    (input.playtestPulse.alphaGate === undefined ||
      input.playtestPulse.alphaGate.status === "ready");
  const revenueObserved = input.revenueSignal?.status === "observed";
  const replayPosture = input.replayIntegrity ?? getReplayIntegrityPosture();
  const aiPosture = input.remoteAi ?? remoteAiPosture();

  const rights = input.rightsEvidence ?? {
    status: "declared" as const,
    path: "LICENSE and LICENSING.md",
  };
  const testsVerified = input.verification?.tests?.status === "verified";
  const buildVerified =
    input.verification?.productionBuild?.status === "verified";

  const releaseBlockers: string[] = [];
  const releaseWarnings: string[] = [];
  if (!input.healthy) releaseBlockers.push("Server health is degraded.");
  if (replayPosture.status === "missing") {
    releaseBlockers.push("Replay integrity key is missing.");
  } else if (replayPosture.status !== "configured") {
    releaseWarnings.push(
      "Replay integrity uses development-only key material.",
    );
  }
  if (rights.status === "missing") {
    releaseBlockers.push("Rights provenance evidence is missing.");
  } else if (rights.status !== "verified") {
    releaseWarnings.push(
      `Rights provenance is declared at ${rights.path}, not runtime-verified.`,
    );
  }
  if (!testsVerified)
    releaseWarnings.push(
      "Test commands are declared but no fresh verified run is attached.",
    );
  if (!buildVerified)
    releaseWarnings.push(
      "Production build is declared but no fresh verified run is attached.",
    );
  if (!revenueObserved)
    releaseWarnings.push("No live supporter/revenue observation is attached.");
  if (!pulseReady)
    releaseWarnings.push("Authenticated human alpha evidence is not ready.");

  const releaseStatus =
    releaseBlockers.length > 0
      ? "blocked"
      : releaseWarnings.length > 0
        ? "warning"
        : "ready";
  const declared = [
    ...declaredTestSurfaces.map(
      (surface) => `${surface.label}: ${surface.command}`,
    ),
  ];
  const verified: string[] = [];
  verified.push(
    aiPosture.costProfile === "cost-neutral"
      ? `Remote AI is cost-neutral by default (${aiPosture.reason}).`
      : `Remote AI has a hard cap of ${aiPosture.maxCallsPerHour} calls/hour.`,
  );
  const missing = [...releaseBlockers];
  if (testsVerified)
    verified.push("Fresh unit/server regression run attached.");
  if (buildVerified) verified.push("Fresh production build run attached.");
  if (rights.status === "verified")
    verified.push(`Rights evidence verified at ${rights.path}.`);
  else declared.push(`Rights evidence declared at ${rights.path}.`);
  if (revenueObserved) verified.push("Live supporter/revenue signal observed.");
  if (pulseReady)
    verified.push("Authenticated human alpha evidence gate passed.");
  if (replayPosture.status === "configured")
    verified.push(replayPosture.evidence);

  return {
    project: "vaultfront",
    status: serverStatus,
    serverStatus,
    releaseStatus,
    generatedAt: new Date().toISOString(),
    processRole: input.processRole,
    workerId: input.workerId,
    healthEvidence,
    checks: {
      serverHealth: input.healthy ? "pass" : "fail",
      testSurfacesRegistered:
        testsVerified && buildVerified ? "verified" : "declared",
      revenueSignal: revenueObserved ? "pass" : "warn",
      freeTierCost: "verified",
      aiCostGuardrail: "verified",
      playtestPulse: pulseReady ? "pass" : "warn",
      replayIntegrity:
        replayPosture.status === "configured"
          ? "pass"
          : replayPosture.status === "development-only"
            ? "warn"
            : "fail",
      rightsProvenance:
        rights.status === "verified"
          ? "pass"
          : rights.status === "declared"
            ? "warn"
            : "fail",
    },
    evidence: { declared, verified, missing },
    releaseBlockers,
    releaseWarnings,
    testSurfaces: declaredTestSurfaces.map((surface) => ({
      ...surface,
      evidenceStatus:
        surface.command === "npm test"
          ? testsVerified
            ? "verified"
            : "declared"
          : surface.command === "npm run build-prod"
            ? buildVerified
              ? "verified"
              : "declared"
            : "declared",
    })),
    launchGates: [
      {
        gate: "copyleft-provenance",
        status:
          rights.status === "verified"
            ? "pass"
            : rights.status === "declared"
              ? "warn"
              : "block",
        evidence:
          rights.status === "missing"
            ? "Rights evidence is missing."
            : `AGPL obligations are ${rights.status} at root ${rights.path}.`,
      },
      {
        gate: "replay-integrity",
        status:
          replayPosture.status === "configured"
            ? "pass"
            : replayPosture.status === "development-only"
              ? "warn"
              : "block",
        evidence: replayPosture.evidence,
      },
      {
        gate: "free-tier-cost",
        status: "pass",
        evidence:
          aiPosture.costProfile === "cost-neutral"
            ? `Remote AI is disabled/cost-neutral by default (${aiPosture.reason}).`
            : `Remote AI is opt-in with a process hard cap of ${aiPosture.maxCallsPerHour} calls/hour; ${aiPosture.callsRemaining} remain in this window.`,
      },
      {
        gate: "revenue-signal",
        status: revenueObserved ? "pass" : "warn",
        evidence: revenueObserved
          ? `Live revenue/supporter signal observed${input.revenueSignal?.observedAt ? ` at ${input.revenueSignal.observedAt}` : ""}.`
          : "Checkout API is present, but no live revenue/supporter signal has been observed.",
      },
      {
        gate: "test-evidence",
        status: testsVerified && buildVerified ? "pass" : "warn",
        evidence:
          testsVerified && buildVerified
            ? "Fresh test and production-build verification are attached."
            : "Commands are registered, but declared commands are not proof that they passed.",
      },
      {
        gate: "playtest-pulse",
        status: pulseReady ? "pass" : "warn",
        evidence: input.playtestPulse
          ? `Pulse ${input.playtestPulse.status} at score ${input.playtestPulse.score}; alpha gate ${input.playtestPulse.alphaGate?.status ?? "not attached"}${input.playtestPulse.alphaGate?.passLabel ? ` (${input.playtestPulse.alphaGate.passLabel})` : ""}; latest event ${input.playtestPulse.freshness.lastEventAt ?? "not recorded"}. Next: ${input.playtestPulse.alphaGate?.nextCheck ?? input.playtestPulse.actionInsights?.[0] ?? "Run a focused authenticated internal playtest."}`
          : "No authenticated human playtest pulse is attached to this process.",
      },
    ],
    playtestPulse: input.playtestPulse,
    remoteAi: aiPosture,
  };
}
