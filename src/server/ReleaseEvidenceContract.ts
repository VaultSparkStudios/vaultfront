export type ReleaseObservationStatus = "verified" | "failed" | "missing";

export interface ReleaseGateObservation {
  status: ReleaseObservationStatus;
  observedAt?: string;
  source?: string;
  digest?: string;
  detail?: string;
}

export const canonicalReleaseGateNames = [
  "staging",
  "stagingParity",
  "contactEmail",
  "obeliskIdentity",
  "themeReadability",
  "footerManifest",
  "founderApproval",
] as const;

export type CanonicalReleaseGateName =
  (typeof canonicalReleaseGateNames)[number];

export interface CanonicalReleaseEvidenceInput {
  alphaGateStatus?: "not-started" | "warming" | "blocked" | "ready";
  observations?: Partial<
    Record<CanonicalReleaseGateName, ReleaseGateObservation>
  >;
  now?: number;
  maxAgeMs?: number;
}

export interface EvaluatedReleaseGate {
  gate: CanonicalReleaseGateName | "alphaHumanEvidence";
  status: "pass" | "block";
  evidenceStatus: ReleaseObservationStatus;
  source: string | null;
  observedAt: string | null;
  digest: string | null;
  detail: string;
}

export interface CanonicalReleaseEvidence {
  schemaVersion: 1;
  status: "ready" | "blocked";
  evaluatedAt: string;
  gates: EvaluatedReleaseGate[];
  blockers: string[];
}

function evaluateObservation(
  gate: CanonicalReleaseGateName,
  observation: ReleaseGateObservation | undefined,
  now: number,
  maxAgeMs: number,
): EvaluatedReleaseGate {
  const observedAtMs = observation?.observedAt
    ? Date.parse(observation.observedAt)
    : Number.NaN;
  const fresh =
    Number.isFinite(observedAtMs) &&
    observedAtMs <= now &&
    now - observedAtMs <= maxAgeMs;
  const provenanceComplete = Boolean(
    observation?.source?.trim() && observation?.digest?.trim(),
  );
  const pass =
    observation?.status === "verified" && fresh && provenanceComplete;
  const reason = !observation
    ? "No observation is attached."
    : observation.status !== "verified"
      ? (observation.detail ?? `Observation status is ${observation.status}.`)
      : !fresh
        ? "Observation is missing a valid fresh timestamp."
        : !provenanceComplete
          ? "Observation is missing source or digest provenance."
          : (observation.detail ??
            "Fresh provenance-backed evidence verified.");
  return {
    gate,
    status: pass ? "pass" : "block",
    evidenceStatus: observation?.status ?? "missing",
    source: observation?.source ?? null,
    observedAt: observation?.observedAt ?? null,
    digest: observation?.digest ?? null,
    detail: reason,
  };
}

export function evaluateCanonicalReleaseEvidence(
  input: CanonicalReleaseEvidenceInput = {},
): CanonicalReleaseEvidence {
  const now = input.now ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? 24 * 60 * 60 * 1_000;
  const gates: EvaluatedReleaseGate[] = canonicalReleaseGateNames.map((gate) =>
    evaluateObservation(gate, input.observations?.[gate], now, maxAgeMs),
  );
  gates.push({
    gate: "alphaHumanEvidence",
    status: input.alphaGateStatus === "ready" ? "pass" : "block",
    evidenceStatus: input.alphaGateStatus === "ready" ? "verified" : "missing",
    source: input.alphaGateStatus ? "playtestPulse.alphaGate" : null,
    observedAt: null,
    digest: null,
    detail:
      input.alphaGateStatus === "ready"
        ? "Authenticated human alpha gate is ready."
        : `Authenticated human alpha gate is ${input.alphaGateStatus ?? "not attached"}.`,
  });
  const blockers = gates
    .filter((gate) => gate.status === "block")
    .map((gate) => `${gate.gate}: ${gate.detail}`);
  return {
    schemaVersion: 1,
    status: blockers.length === 0 ? "ready" : "blocked",
    evaluatedAt: new Date(now).toISOString(),
    gates,
    blockers,
  };
}
