// VaultFront — Elo rating utility (pure, no side-effects)

export interface EloResult {
  newRatingA: number;
  newRatingB: number;
  deltaA: number;
  deltaB: number;
}

export type EloLabel =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Grandmaster";

export const PLACEMENT_MATCH_COUNT = 5;

export const EloRating = {
  K_FACTOR: 32,
  K_FACTOR_PLACEMENT: 64,
  DEFAULT_RATING: 1200,
  SEASONAL_SOFT_RESET_CAP: 200,

  /**
   * Expected score (probability of winning) for player A against player B.
   * Returns a value in [0, 1].
   */
  expectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  },

  /**
   * Calculate new Elo ratings after a match between A and B.
   * wonA: true if player A won, false if player B won.
   * matchesPlayedA/B: used to select K factor (placement vs normal).
   */
  calculate(
    ratingA: number,
    ratingB: number,
    wonA: boolean,
    matchesPlayedA = Infinity,
    matchesPlayedB = Infinity,
  ): EloResult {
    const expectedA = EloRating.expectedScore(ratingA, ratingB);
    const expectedB = 1 - expectedA;
    const scoreA = wonA ? 1 : 0;
    const scoreB = wonA ? 0 : 1;
    const kA =
      matchesPlayedA < PLACEMENT_MATCH_COUNT
        ? EloRating.K_FACTOR_PLACEMENT
        : EloRating.K_FACTOR;
    const kB =
      matchesPlayedB < PLACEMENT_MATCH_COUNT
        ? EloRating.K_FACTOR_PLACEMENT
        : EloRating.K_FACTOR;

    const deltaA = Math.round(kA * (scoreA - expectedA));
    const deltaB = Math.round(kB * (scoreB - expectedB));

    return {
      newRatingA: ratingA + deltaA,
      newRatingB: ratingB + deltaB,
      deltaA,
      deltaB,
    };
  },

  /**
   * Map an Elo rating to a human-readable tier label.
   * Thresholds: <1000 Bronze, <1200 Silver, <1400 Gold,
   *             <1600 Platinum, <1900 Diamond, >=1900 Grandmaster.
   */
  ratingLabel(rating: number): EloLabel {
    if (rating < 1000) return "Bronze";
    if (rating < 1200) return "Silver";
    if (rating < 1400) return "Gold";
    if (rating < 1600) return "Platinum";
    if (rating < 1900) return "Diamond";
    return "Grandmaster";
  },
} as const;
