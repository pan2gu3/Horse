-- Allow multiple bets per user per event
ALTER TABLE predictions DROP CONSTRAINT IF EXISTS predictions_user_id_event_id_key;
