import { describe, expect, it } from "vitest";
import {
  type ClientSendWinnerMessage,
  MatchResultCertificateSchema,
} from "../../src/core/Schemas";
import {
  buildMatchResultCertificate,
  MatchResultQuorum,
  validateCompleteMatchResult,
  verifyMatchResultCertificate,
} from "../../src/server/MatchResultCertificate";

const roster = ["client01", "client02"];

function result(
  winner: ClientSendWinnerMessage["winner"] = ["player", "client01"],
  clientIDs: readonly string[] = roster,
  score = 1n,
): ClientSendWinnerMessage {
  return {
    type: "winner",
    winner,
    allPlayersStats: Object.fromEntries(
      clientIDs.map((clientID, index) => [
        clientID,
        { vaultfront: { vaultCaptures: score + BigInt(index) } },
      ]),
    ),
  } as ClientSendWinnerMessage;
}

describe("quorum-attested match notary", () => {
  it("rejects a 50/50 split because neither complete result has a strict majority", () => {
    const quorum = new MatchResultQuorum();
    const activeIPs = new Set(["10.0.0.1", "10.0.0.2"]);
    const first = quorum.attest({
      ip: "10.0.0.1",
      result: result(),
      expectedClientIDs: roster,
      activeIPs,
    });
    const second = quorum.attest({
      ip: "10.0.0.2",
      result: result(["player", "client02"]),
      expectedClientIDs: roster,
      activeIPs,
    });

    expect(first).toMatchObject({ status: "pending", votes: 1, required: 2 });
    expect(second).toMatchObject({ status: "pending", votes: 1, required: 2 });
  });

  it("counts one network identity once, including conflicting duplicate-IP clients", () => {
    const quorum = new MatchResultQuorum();
    const activeIPs = new Set(["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
    expect(
      quorum.attest({
        ip: "10.0.0.1",
        result: result(),
        expectedClientIDs: roster,
        activeIPs,
      }).status,
    ).toBe("pending");

    expect(
      quorum.attest({
        ip: "10.0.0.1",
        result: result(["player", "client02"]),
        expectedClientIDs: roster,
        activeIPs,
      }),
    ).toEqual({ status: "rejected", reason: "conflicting-ip-attestation" });
  });

  it("rejects incomplete/foreign rosters and winners outside the start roster", () => {
    expect(
      validateCompleteMatchResult(result(undefined, ["client01"]), roster),
    ).toEqual({
      ok: false,
      reason: "result-roster-incomplete-or-foreign",
    });
    expect(
      validateCompleteMatchResult(
        result(["player", "intruder"], ["client01", "client02"]),
        roster,
      ),
    ).toEqual({ ok: false, reason: "winner-not-in-roster" });
    expect(
      validateCompleteMatchResult(
        result(["team", "blue", "client01", "client01"]),
        roster,
      ),
    ).toEqual({ ok: false, reason: "winning-team-has-duplicate-members" });
  });

  it("issues a deterministic immutable certificate and detects result tampering", () => {
    const quorum = new MatchResultQuorum();
    const activeIPs = new Set(["10.0.0.1", "10.0.0.2", "10.0.0.3"]);
    const attested = result();
    quorum.attest({
      ip: "10.0.0.1",
      result: attested,
      expectedClientIDs: roster,
      activeIPs,
    });
    const accepted = quorum.attest({
      ip: "10.0.0.2",
      result: attested,
      expectedClientIDs: roster,
      activeIPs,
    });
    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted") throw new Error("not accepted");

    const input = {
      gameID: "game1234",
      config: { gameMap: "plains", gameType: "private" } as any,
      turns: [{ intents: [], hash: 42 }] as any,
      accepted,
    };
    const certificate = buildMatchResultCertificate(input);
    const replayed = buildMatchResultCertificate(input);

    expect(certificate.certificateId).toBe(replayed.certificateId);
    expect(Object.isFrozen(certificate)).toBe(true);
    expect(Object.isFrozen(certificate.result.allPlayersStats)).toBe(true);
    expect(MatchResultCertificateSchema.safeParse(certificate).success).toBe(
      true,
    );
    expect(verifyMatchResultCertificate(certificate)).toBe(true);

    const tampered = structuredClone(certificate);
    tampered.result.winner = ["player", "client02"];
    expect(verifyMatchResultCertificate(tampered)).toBe(false);
  });
});
