import type { PredictionWithDetails } from './types';

export function dateDiffDays(dateA: string, dateB: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(a - b) / msPerDay);
}

export function computeScore(
  prediction: PredictionWithDetails,
  actualGuestId: string,
  actualBookingDate: string,
  wagerAmount: number
): number {
  if (prediction.guest_id !== actualGuestId) {
    return 0;
  }
  const diff = dateDiffDays(prediction.predicted_date, actualBookingDate);
  return wagerAmount / (1 + diff);
}

export interface ScoredPrediction extends PredictionWithDetails {
  score: number;
  payout: number;
}

export function computePayouts(
  predictions: PredictionWithDetails[],
  actualGuestId: string,
  actualBookingDate: string,
  wagerAmount: number
): ScoredPrediction[] {
  const numPlayers = predictions.length;
  const totalPot = wagerAmount * numPlayers;

  const scored = predictions.map((p) => ({
    ...p,
    score: computeScore(p, actualGuestId, actualBookingDate, wagerAmount),
    payout: 0,
  }));

  const scoreSum = scored.reduce((sum, p) => sum + p.score, 0);

  if (scoreSum === 0) {
    return scored;
  }

  return scored.map((p) => ({
    ...p,
    payout: (p.score / scoreSum) * totalPot,
  }));
}
