/**
 * ClanWarStore — clan-vs-clan challenge scheduling.
 *
 * Clans issue challenges to each other. Once accepted, a best-of-3 series
 * is scheduled at the proposed time. Results are tracked for clan Elo impact.
 * Wires into TournamentStore for actual match bracket management.
 */

import { nanoid } from "nanoid";
import { logger } from "./Logger";

export type WarStatus =
  | "pending"
  | "accepted"
  | "active"
  | "complete"
  | "declined"
  | "expired";

export interface ClanWar {
  id: string;
  challengerClanId: string;
  targetClanId: string;
  proposedAt: number; // scheduled start time (ms)
  createdAt: number;
  acceptedAt?: number;
  status: WarStatus;
  seriesFormat: "bo3" | "bo1";
  challengerWins: number;
  targetWins: number;
  winnerId?: string; // clanId of the winner
  tournamentId?: string; // linked TournamentStore id
  mapName: string;
  notes: string;
}

export interface WarSummary extends ClanWar {
  isChallengeExpired: boolean;
}

class ClanWarStore {
  private wars = new Map<string, ClanWar>();
  // clanId → warIds
  private clanIndex = new Map<string, Set<string>>();

  private index(clanId: string, warId: string): void {
    const s = this.clanIndex.get(clanId) ?? new Set<string>();
    s.add(warId);
    this.clanIndex.set(clanId, s);
  }

  challenge(opts: {
    challengerClanId: string;
    targetClanId: string;
    proposedAt: number;
    mapName?: string;
    notes?: string;
    seriesFormat?: "bo3" | "bo1";
  }): ClanWar {
    const id = nanoid(12);
    const war: ClanWar = {
      id,
      challengerClanId: opts.challengerClanId,
      targetClanId: opts.targetClanId,
      proposedAt: opts.proposedAt,
      createdAt: Date.now(),
      status: "pending",
      seriesFormat: opts.seriesFormat ?? "bo3",
      challengerWins: 0,
      targetWins: 0,
      mapName: opts.mapName ?? "",
      notes: (opts.notes ?? "").slice(0, 200),
    };
    this.wars.set(id, war);
    this.index(opts.challengerClanId, id);
    this.index(opts.targetClanId, id);
    logger.info("clan-war challenge issued", {
      id,
      challengerClanId: opts.challengerClanId,
      targetClanId: opts.targetClanId,
    });
    return war;
  }

  accept(warId: string, byPersistentId: string): ClanWar | null {
    const war = this.wars.get(warId);
    if (!war || war.status !== "pending") return null;
    war.status = "accepted";
    war.acceptedAt = Date.now();
    logger.info("clan-war accepted", { warId, byPersistentId });
    return war;
  }

  decline(warId: string): ClanWar | null {
    const war = this.wars.get(warId);
    if (!war || war.status !== "pending") return null;
    war.status = "declined";
    return war;
  }

  recordResult(warId: string, winnerClanId: string): ClanWar | null {
    const war = this.wars.get(warId);
    if (!war || (war.status !== "accepted" && war.status !== "active"))
      return null;
    war.status = "active";
    if (winnerClanId === war.challengerClanId) {
      war.challengerWins++;
    } else if (winnerClanId === war.targetClanId) {
      war.targetWins++;
    }
    const threshold = war.seriesFormat === "bo3" ? 2 : 1;
    if (war.challengerWins >= threshold) {
      war.status = "complete";
      war.winnerId = war.challengerClanId;
    } else if (war.targetWins >= threshold) {
      war.status = "complete";
      war.winnerId = war.targetClanId;
    }
    return war;
  }

  getWar(warId: string): WarSummary | null {
    const war = this.wars.get(warId);
    if (!war) return null;
    const expireAfter = 72 * 60 * 60 * 1000; // 72h
    return {
      ...war,
      isChallengeExpired:
        war.status === "pending" && Date.now() - war.createdAt > expireAfter,
    };
  }

  getForClan(clanId: string): WarSummary[] {
    const ids = this.clanIndex.get(clanId) ?? new Set<string>();
    return [...ids]
      .map((id) => this.getWar(id))
      .filter((w): w is WarSummary => w !== null)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
  }

  getUpcoming(): WarSummary[] {
    const now = Date.now();
    return [...this.wars.values()]
      .filter((w) => w.status === "accepted" && w.proposedAt > now)
      .map((w) => ({ ...w, isChallengeExpired: false }))
      .sort((a, b) => a.proposedAt - b.proposedAt)
      .slice(0, 10);
  }
}

export const clanWarStore = new ClanWarStore();
