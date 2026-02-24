-- Migration: Variable Wager & Per-Horse Resolution
-- Adds bet_amount to predictions, actual_booking_date to guests,
-- removes old single-resolution columns from events, clears test predictions.

ALTER TABLE predictions ADD COLUMN IF NOT EXISTS bet_amount INTEGER NOT NULL DEFAULT 10;

ALTER TABLE guests ADD COLUMN IF NOT EXISTS actual_booking_date DATE;

ALTER TABLE events DROP CONSTRAINT IF EXISTS fk_events_actual_guest;
ALTER TABLE events DROP COLUMN IF EXISTS actual_final_guest_id;
ALTER TABLE events DROP COLUMN IF EXISTS actual_booking_date;

DELETE FROM predictions;
