-- wager_amount moved to predictions.bet_amount (per-player variable wager)
ALTER TABLE events DROP COLUMN IF EXISTS wager_amount;
