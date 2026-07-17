import { describe, expect, it } from "vitest";
import {
  canManageClan,
  canManageTournament,
  verifyOptionalIdentityClaim,
} from "../../src/server/VaultFrontAuthorization";

const actor = { actorKey: "actor", persistentId: "player-1" };

describe("VaultFront authorization policies", () => {
  it("binds optional compatibility claims to the verified token actor", () => {
    expect(verifyOptionalIdentityClaim(actor)).toEqual({ ok: true });
    expect(verifyOptionalIdentityClaim(actor, "player-1")).toEqual({
      ok: true,
    });
    expect(verifyOptionalIdentityClaim(actor, "player-2")).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("limits clan management to founders and officers", () => {
    const clan = {
      founderId: "founder",
      members: [
        { persistentId: "officer", role: "officer" },
        { persistentId: "member", role: "member" },
      ],
    };
    expect(canManageClan(clan, "founder")).toBe(true);
    expect(canManageClan(clan, "officer")).toBe(true);
    expect(canManageClan(clan, "member")).toBe(false);
    expect(canManageClan(null, "founder")).toBe(false);
  });

  it("limits tournament operations to the creator", () => {
    expect(canManageTournament({ createdBy: "owner" }, "owner")).toBe(true);
    expect(canManageTournament({ createdBy: "owner" }, "other")).toBe(false);
    expect(canManageTournament(null, "owner")).toBe(false);
  });
});
