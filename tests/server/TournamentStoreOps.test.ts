import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/server/db/pool", () => ({ pool: null }));

import { tournamentStore } from "../../src/server/TournamentStore";

describe("TournamentStore operations brief", () => {
  it("summarizes bracket state for an operator", async () => {
    const tournament = await tournamentStore.create({
      name: "Ops Brief Cup",
      createdBy: "organizer",
      maxPlayers: 4,
    });

    await tournamentStore.register(tournament.id, "alpha", 1500);
    await tournamentStore.register(tournament.id, "bravo", 1200);

    const registrationView = await tournamentStore.getBracket(tournament.id);
    expect(registrationView?.operations.missingSlots).toBe(2);
    expect(registrationView?.operations.nextAction).toContain("Recruit");

    const seeded = await tournamentStore.seedBracket(tournament.id);
    expect("error" in seeded).toBe(false);
    if ("error" in seeded) return;

    expect(seeded.operations.nextMatchId).not.toBeNull();
    expect(seeded.operations.nextAction).toContain("match");
    expect(seeded.operations.overlayUrl).toContain(tournament.id);
  });
});
