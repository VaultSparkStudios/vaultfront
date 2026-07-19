import { createHash } from "node:crypto";
import type {
  ClientSendWinnerMessage,
  GameConfig,
  MatchResultCertificate,
  Turn,
  Winner,
} from "../core/Schemas";

const MAX_RESULT_PLAYERS = 400;

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function canonicalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite-number");
    return value;
  }
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new Error(`unsupported-canonical-value:${typeof value}`);
}

export function canonicalEvidenceDigest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function immutableClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  const clone: unknown = Array.isArray(value)
    ? value.map((entry) => immutableClone(entry))
    : Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          immutableClone(entry),
        ]),
      );
  return Object.freeze(clone) as T;
}

function validateWinner(
  winner: Winner,
  roster: ReadonlySet<string>,
): string | null {
  if (!winner) return "winner-missing";
  if (winner[0] === "player") {
    if (winner.length !== 2 || !roster.has(winner[1]))
      return "winner-not-in-roster";
    return null;
  }
  if (winner[0] === "team") {
    const members = winner.slice(2);
    if (members.length === 0) return "winning-team-empty";
    if (new Set(members).size !== members.length)
      return "winning-team-has-duplicate-members";
    if (members.some((clientID) => !roster.has(clientID)))
      return "winner-not-in-roster";
    return null;
  }
  return winner.length === 2 ? null : "nation-winner-has-player-members";
}

export function validateCompleteMatchResult(
  result: ClientSendWinnerMessage,
  expectedClientIDs: readonly string[],
): { ok: true; digest: string } | { ok: false; reason: string } {
  if (
    expectedClientIDs.length === 0 ||
    expectedClientIDs.length > MAX_RESULT_PLAYERS ||
    new Set(expectedClientIDs).size !== expectedClientIDs.length
  ) {
    return { ok: false, reason: "invalid-expected-roster" };
  }
  const roster = new Set(expectedClientIDs);
  const reported = Object.keys(result.allPlayersStats);
  if (
    reported.length !== expectedClientIDs.length ||
    reported.some((clientID) => !roster.has(clientID))
  ) {
    return { ok: false, reason: "result-roster-incomplete-or-foreign" };
  }
  const winnerError = validateWinner(result.winner, roster);
  if (winnerError) return { ok: false, reason: winnerError };
  try {
    return {
      ok: true,
      digest: canonicalEvidenceDigest({
        winner: result.winner,
        allPlayersStats: result.allPlayersStats,
      }),
    };
  } catch (error) {
    return { ok: false, reason: `result-not-canonical:${String(error)}` };
  }
}

export type ResultAttestation =
  | { status: "rejected"; reason: string }
  | { status: "pending"; resultDigest: string; votes: number; required: number }
  | {
      status: "accepted";
      resultDigest: string;
      result: ClientSendWinnerMessage;
      votes: number;
      activeUniqueIPs: number;
    };

/** One immutable vote per network identity, grouped by the complete result digest. */
export class MatchResultQuorum {
  private readonly votes = new Map<
    string,
    { result: ClientSendWinnerMessage; ips: Set<string> }
  >();
  private readonly digestByIP = new Map<string, string>();

  attest(input: {
    ip: string;
    result: ClientSendWinnerMessage;
    expectedClientIDs: readonly string[];
    activeIPs: ReadonlySet<string>;
  }): ResultAttestation {
    if (!input.activeIPs.has(input.ip))
      return { status: "rejected", reason: "attestor-not-active" };
    const validation = validateCompleteMatchResult(
      input.result,
      input.expectedClientIDs,
    );
    if (!validation.ok)
      return { status: "rejected", reason: validation.reason };

    const previousDigest = this.digestByIP.get(input.ip);
    if (previousDigest)
      return {
        status: "rejected",
        reason:
          previousDigest === validation.digest
            ? "duplicate-ip-attestation"
            : "conflicting-ip-attestation",
      };

    this.digestByIP.set(input.ip, validation.digest);
    let bucket = this.votes.get(validation.digest);
    if (!bucket) {
      bucket = { result: immutableClone(input.result), ips: new Set() };
      this.votes.set(validation.digest, bucket);
    }
    bucket.ips.add(input.ip);

    const activeUniqueIPs = input.activeIPs.size;
    const required = Math.floor(activeUniqueIPs / 2) + 1;
    if (bucket.ips.size < required) {
      return {
        status: "pending",
        resultDigest: validation.digest,
        votes: bucket.ips.size,
        required,
      };
    }
    return {
      status: "accepted",
      resultDigest: validation.digest,
      result: bucket.result,
      votes: bucket.ips.size,
      activeUniqueIPs,
    };
  }
}

function certificateEvidence(
  certificate: Omit<MatchResultCertificate, "certificateId">,
) {
  return {
    schemaVersion: certificate.schemaVersion,
    gameID: certificate.gameID,
    config: certificate.config,
    turns: certificate.turns,
    result: certificate.result,
    quorum: certificate.quorum,
  };
}

export function buildMatchResultCertificate(input: {
  gameID: string;
  config: GameConfig;
  turns: readonly Turn[];
  accepted: Extract<ResultAttestation, { status: "accepted" }>;
}): MatchResultCertificate {
  const config = { digest: canonicalEvidenceDigest(input.config) };
  const turns = {
    digest: canonicalEvidenceDigest(input.turns),
    count: input.turns.length,
    lastHash: input.turns.at(-1)?.hash ?? null,
  };
  const result = {
    digest: input.accepted.resultDigest,
    winner: input.accepted.result.winner,
    allPlayersStats: input.accepted.result.allPlayersStats,
  };
  const withoutId = {
    schemaVersion: "1.0" as const,
    gameID: input.gameID,
    config,
    turns,
    result,
    quorum: {
      acceptedUniqueIPs: input.accepted.votes,
      activeUniqueIPs: input.accepted.activeUniqueIPs,
    },
  };
  return immutableClone({
    ...withoutId,
    certificateId: canonicalEvidenceDigest(certificateEvidence(withoutId)),
  });
}

export function verifyMatchResultCertificate(
  certificate: MatchResultCertificate,
): boolean {
  if (
    certificate.quorum.acceptedUniqueIPs * 2 <=
    certificate.quorum.activeUniqueIPs
  )
    return false;
  if (
    canonicalEvidenceDigest({
      winner: certificate.result.winner,
      allPlayersStats: certificate.result.allPlayersStats,
    }) !== certificate.result.digest
  )
    return false;
  return (
    canonicalEvidenceDigest(
      certificateEvidence({
        schemaVersion: certificate.schemaVersion,
        gameID: certificate.gameID,
        config: certificate.config,
        turns: certificate.turns,
        result: certificate.result,
        quorum: certificate.quorum,
      }),
    ) === certificate.certificateId
  );
}
