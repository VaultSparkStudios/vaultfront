/**
 * PredictionLeagueStore — persistent spectator prediction accuracy tracking.
 *
 * Spectators who predict match outcomes (intercept vs delivery) via the
 * crowd-vote endpoint accumulate accuracy scores week-over-week.
 * Leaderboard shows top predictors, building community loyalty.
 */

import { logger } from "./Logger";

export interface Prediction {
  gameId: string;
  spectatorId: string;
  predictedOutcome: "intercept" | "delivery";
  actualOutcome?: "intercept" | "delivery";
  resolved: boolean;
  correct?: boolean;
  timestamp: number;
  weekKey: string; // "YYYY-WW" format for weekly bucketing
}

export interface SpectatorLeaderboardEntry {
  spectatorId: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number; // 0-100
  weeklyScore: number;
  allTimeScore: number;
  currentWeekKey: string;
}

function getWeekKey(ts = Date.now()): string {
  const d = new Date(ts);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - startOfYear.getTime()) / 86400000 +
      startOfYear.getDay() +
      1) /
      7,
  );
  return `${d.getFullYear()}-${String(week).padStart(2, "0")}`;
}

class PredictionLeagueStore {
  // gameId → Map<spectatorId, prediction>
  private pending = new Map<string, Map<string, Prediction>>();
  // spectatorId → all predictions (keep last 500 per spectator)
  private history = new Map<string, Prediction[]>();

  recordPrediction(
    gameId: string,
    spectatorId: string,
    outcome: "intercept" | "delivery",
  ): void {
    if (!gameId || !spectatorId) return;
    const gamePredictions =
      this.pending.get(gameId) ?? new Map<string, Prediction>();
    if (gamePredictions.has(spectatorId)) return; // one prediction per game per spectator
    const pred: Prediction = {
      gameId,
      spectatorId,
      predictedOutcome: outcome,
      resolved: false,
      timestamp: Date.now(),
      weekKey: getWeekKey(),
    };
    gamePredictions.set(spectatorId, pred);
    this.pending.set(gameId, gamePredictions);
  }

  resolveGame(gameId: string, actualOutcome: "intercept" | "delivery"): void {
    const gamePredictions = this.pending.get(gameId);
    if (!gamePredictions) return;
    for (const pred of gamePredictions.values()) {
      pred.actualOutcome = actualOutcome;
      pred.resolved = true;
      pred.correct = pred.predictedOutcome === actualOutcome;
      const spectatorHistory = this.history.get(pred.spectatorId) ?? [];
      spectatorHistory.push(pred);
      if (spectatorHistory.length > 500) spectatorHistory.shift();
      this.history.set(pred.spectatorId, spectatorHistory);
    }
    this.pending.delete(gameId);
    logger.info("prediction-league resolved", {
      gameId,
      actualOutcome,
      count: gamePredictions.size,
    });
  }

  getLeaderboard(limit = 10, weekOnly = false): SpectatorLeaderboardEntry[] {
    const currentWeek = getWeekKey();
    const scores = new Map<
      string,
      { total: number; correct: number; weekly: number }
    >();
    for (const [spectatorId, preds] of this.history.entries()) {
      const resolved = preds.filter((p) => p.resolved);
      if (resolved.length === 0) continue;
      const correct = resolved.filter((p) => p.correct).length;
      const weekCorrect = resolved.filter(
        (p) => p.weekKey === currentWeek && p.correct,
      ).length;
      scores.set(spectatorId, {
        total: weekOnly
          ? resolved.filter((p) => p.weekKey === currentWeek).length
          : resolved.length,
        correct: weekOnly ? weekCorrect : correct,
        weekly: weekCorrect,
      });
    }
    return [...scores.entries()]
      .filter(([, s]) => s.total >= 2)
      .map(([spectatorId, s]) => ({
        spectatorId,
        totalPredictions: s.total,
        correctPredictions: s.correct,
        accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
        weeklyScore: s.weekly,
        allTimeScore:
          this.history.get(spectatorId)?.filter((p) => p.resolved && p.correct)
            .length ?? 0,
        currentWeekKey: currentWeek,
      }))
      .sort(
        (a, b) =>
          b.accuracy - a.accuracy || b.totalPredictions - a.totalPredictions,
      )
      .slice(0, limit);
  }

  getSpectatorStats(spectatorId: string): SpectatorLeaderboardEntry | null {
    const preds = this.history.get(spectatorId);
    if (!preds || preds.length === 0) return null;
    const resolved = preds.filter((p) => p.resolved);
    const correct = resolved.filter((p) => p.correct).length;
    const currentWeek = getWeekKey();
    const weekCorrect = resolved.filter(
      (p) => p.weekKey === currentWeek && p.correct,
    ).length;
    return {
      spectatorId,
      totalPredictions: resolved.length,
      correctPredictions: correct,
      accuracy:
        resolved.length > 0 ? Math.round((correct / resolved.length) * 100) : 0,
      weeklyScore: weekCorrect,
      allTimeScore: correct,
      currentWeekKey: currentWeek,
    };
  }
}

export const predictionLeagueStore = new PredictionLeagueStore();
