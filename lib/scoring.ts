import type { PredictionWithDetails } from './types';

const T = 28;       // betting window in days
const ALPHA = 2.0;
const PAYOUT_SPLITS = [0.75, 0.25];

export function dateDiffDays(dateA: string, dateB: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(a - b) / msPerDay);
}

function hoursDiff(tsA: string, tsB: string): number {
  const msPerHour = 1000 * 60 * 60;
  return (new Date(tsA).getTime() - new Date(tsB).getTime()) / msPerHour;
}

export function computeScore(
  prediction: PredictionWithDetails,
  marketOpenTimestamp: string
): number {
  if (!prediction.actual_booking_date) return 0;

  const E = dateDiffDays(prediction.predicted_date, prediction.actual_booking_date);

  const tHours = hoursDiff(prediction.submitted_at, marketOpenTimestamp);
  const tDays = Math.min(Math.max(tHours / 24, 0), T);

  const M = 1 + ALPHA * (1 - tDays / T); // = 3 - (t / 14)

  return (Math.sqrt(prediction.bet_amount) / (1 + E)) * M;
}

export interface ScoredPrediction extends PredictionWithDetails {
  score: number;
  payout: number;
  net: number;
}

/**
 * Computes scores and payouts per horse. Each horse's pot is distributed
 * independently: top scorer gets 75%, second gets 25%.
 */
export function computePayoutsPerHorse(
  predictions: PredictionWithDetails[],
  marketOpenTimestamp: string
): ScoredPrediction[] {
  const scored: ScoredPrediction[] = predictions.map((p) => ({
    ...p,
    score: computeScore(p, marketOpenTimestamp),
    payout: 0,
    net: -p.bet_amount,
  }));

  // Group by guest_id (horse)
  const byHorse = new Map<string, ScoredPrediction[]>();
  for (const p of scored) {
    const group = byHorse.get(p.guest_id) ?? [];
    group.push(p);
    byHorse.set(p.guest_id, group);
  }

  // For each horse, distribute payouts within the group
  for (const group of byHorse.values()) {
    const horsePot = group.reduce((sum, p) => sum + p.bet_amount, 0);

    // Sort by score desc, tiebreakers: higher wager → lower date error
    const sorted = [...group].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.bet_amount !== a.bet_amount) return b.bet_amount - a.bet_amount;
      const eA = a.actual_booking_date ? dateDiffDays(a.predicted_date, a.actual_booking_date) : Infinity;
      const eB = b.actual_booking_date ? dateDiffDays(b.predicted_date, b.actual_booking_date) : Infinity;
      return eA - eB;
    });

    // Assign payouts respecting ties at each payout tier
    // sorted holds references to the same objects in scored, so mutations propagate
    let i = 0;
    for (let tier = 0; tier < PAYOUT_SPLITS.length && i < sorted.length; tier++) {
      const tierScore = sorted[i]!.score;

      let j = i;
      while (j < sorted.length && sorted[j]!.score === tierScore) j++;

      const tiedCount = j - i;
      const tiersConsumed = Math.min(tiedCount, PAYOUT_SPLITS.length - tier);

      let tierPot = 0;
      for (let k = tier; k < tier + tiersConsumed; k++) {
        tierPot += PAYOUT_SPLITS[k]! * horsePot;
      }

      const payoutEach = tierPot / tiedCount;
      for (let k = i; k < j; k++) {
        sorted[k]!.payout = payoutEach;
        sorted[k]!.net = payoutEach - sorted[k]!.bet_amount;
      }

      i = j;
      tier += tiersConsumed - 1; // -1 because loop will increment
    }
  }

  return scored;
}
