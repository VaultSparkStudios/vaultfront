export interface VerifiedVaultFrontActor {
  actorKey: string;
  persistentId: string;
}

export type IdentityClaimVerdict =
  | { ok: true }
  | { ok: false; status: 403; error: "Identity claim does not match token" };

export function verifyOptionalIdentityClaim(
  actor: VerifiedVaultFrontActor,
  claimedPersistentId?: string,
): IdentityClaimVerdict {
  if (
    claimedPersistentId !== undefined &&
    claimedPersistentId !== actor.persistentId
  ) {
    return {
      ok: false,
      status: 403,
      error: "Identity claim does not match token",
    };
  }
  return { ok: true };
}

export interface ClanAuthorizationView {
  founderId: string;
  members: Array<{
    persistentId: string;
    role: "founder" | "officer" | "member" | string;
  }>;
}

export function canManageClan(
  clan: ClanAuthorizationView | null,
  persistentId: string,
): boolean {
  if (!clan) return false;
  if (clan.founderId === persistentId) return true;
  return clan.members.some(
    (member) =>
      member.persistentId === persistentId &&
      (member.role === "founder" || member.role === "officer"),
  );
}

export interface TournamentAuthorizationView {
  createdBy: string;
}

export function canManageTournament(
  tournament: TournamentAuthorizationView | null,
  persistentId: string,
): boolean {
  return tournament?.createdBy === persistentId;
}
