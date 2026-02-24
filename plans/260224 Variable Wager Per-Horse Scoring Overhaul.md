# Plan: Variable Wager & Per-Horse Scoring Overhaul

## What's changing and why

The original design had a fixed wager per event and predicted a single "last booker" date. The new design:
- Each player bets a variable amount (10–100) on one horse
- Each horse (guest) gets their own actual booking date at resolution time
- Scoring rewards accuracy AND early betting via a time-based multiplier
- Only top 2 scorers are paid out (75% / 25% of total pot)

---

## Parameters (hardcoded constants)

```
T = 28 days (betting window length)
ALPHA = 2.0
MIN_WAGER = 10
MAX_WAGER = 100
PAYOUT_SPLIT = [0.75, 0.25]
MIN_PLAYERS = 3
```

---

## Scoring formula

```
E = |predicted_date − horse's actual_booking_date| in days (integer)
t = (submitted_at − events.created_at) in hours ÷ 24.0, capped to [0, 28]
M = 3 − (t / 14)     (ranges from 3.0 at t=0 to 1.0 at t=28)
S = (W / (1 + E)) × M
```

Tiebreaker (descending priority):
1. Higher W
2. Lower E
3. Split payout evenly

---

## Phase 1 — DB Migration (run in Supabase SQL editor)

```sql
-- 1. Add bet_amount to predictions
ALTER TABLE predictions ADD COLUMN bet_amount INTEGER NOT NULL DEFAULT 10;

-- 2. Add actual_booking_date to guests
ALTER TABLE guests ADD COLUMN actual_booking_date DATE;

-- 3. Remove old single-resolution columns from events
ALTER TABLE events DROP CONSTRAINT IF EXISTS fk_events_actual_guest;
ALTER TABLE events DROP COLUMN IF EXISTS actual_final_guest_id;
ALTER TABLE events DROP COLUMN IF EXISTS actual_booking_date;

-- 4. Wipe any test predictions (no real users yet)
DELETE FROM predictions;
```

---

## Phase 2 — Code Changes

### `game.config.ts`
- Remove `wagerAmount` field (no longer a fixed event-level value)

### `lib/types.ts`
Update interfaces:
- `Event`: remove `actual_final_guest_id`, remove `actual_booking_date`
- `Guest`: add `actual_booking_date: string | null`
- `Prediction`: add `bet_amount: number`
- `PredictionWithDetails`: add `bet_amount: number`, add `actual_booking_date: string | null` (from guest join)

### `lib/scoring.ts`
Full rewrite. Pure functions only.

```typescript
computeScore(prediction: PredictionWithDetails, marketOpenTimestamp: string): number
// E = dateDiffDays(predicted_date, actual_booking_date)
// t = hoursDiff(submitted_at, marketOpenTimestamp) / 24, capped [0,28]
// M = 3 - (t / 14)
// S = (bet_amount / (1 + E)) * M

computePayouts(predictions: PredictionWithDetails[], marketOpenTimestamp: string): ScoredPrediction[]
// Returns all predictions with score + payout fields
// Top scorer gets 0.75 * totalPot, 2nd gets 0.25 * totalPot
// If fewer than MIN_PLAYERS (3): all payouts = 0
// Tiebreaker: higher bet_amount → lower E → split evenly
```

`ScoredPrediction` adds `score: number`, `payout: number`, `net: number` (payout − bet_amount).

### `pages/api/predict.ts`
Changes:
- **Insert-only** (no upsert) — if prediction already exists for user+event, return 400 "already submitted"
- Validate `bet_amount`: integer, 10–100 (reject decimals via `Number.isInteger`)
- Check betting window: if `now > events.created_at + 28 days`, return 400 "betting window closed"
- Keep existing: auth check, event-open check, guest-belongs-to-event check

### `pages/api/admin/resolve.ts`
Full rewrite. New request body:
```json
{
  "bookings": [
    { "guest_id": "uuid", "actual_booking_date": "YYYY-MM-DD" },
    { "guest_id": "uuid", "actual_booking_date": "YYYY-MM-DD" },
    { "guest_id": "uuid", "actual_booking_date": "YYYY-MM-DD" }
  ]
}
```
Steps:
1. Validate `x-admin-secret` header
2. Validate all guest_ids belong to the same event
3. Check min 3 players total (across all horses) — reject if fewer
4. Update each guest row with their `actual_booking_date`
5. Set event status to `'resolved'`

### `pages/index.tsx`
Changes:
- Add `bet_amount` number input (min 10, max 100, step 1)
- If user already has a prediction: show it read-only (no form), with a message "prediction locked"
- Show betting window status: if closed, show "betting closed" instead of form
- Remove all "update prediction" UI language

### `pages/results.tsx`
Changes:
- Update `getServerSideProps` to join guests with `actual_booking_date`
- Pass `event.created_at` as `marketOpenTimestamp` to `computePayouts`
- Table columns: Player | Horse | Predicted Date | Actual Date | Error (days) | Wager | Score | Payout | Net
- Highlight top 2 rows
- If fewer than 3 players: show "minimum 3 players required — results unavailable"

### `game.config.ts`
Remove `wagerAmount: 20`.

---

## Phase 3 — Update CLAUDE.md

- Update scoring formula section
- Update resolve curl example to new per-horse format
- Update schema section

---

## File change order

1. Run SQL migration in Supabase
2. `game.config.ts` — remove wagerAmount
3. `lib/types.ts` — update interfaces
4. `lib/scoring.ts` — full rewrite
5. `pages/api/predict.ts` — insert-only + bet_amount + window check
6. `pages/api/admin/resolve.ts` — per-horse resolution
7. `pages/index.tsx` — bet_amount input, lock on submit
8. `pages/results.tsx` — new columns, top-2 highlight
9. `CLAUDE.md` — update docs
10. Commit + push → Vercel auto-deploys

---

## New resolve curl (after deploy)

```bash
curl -X POST https://horse-five.vercel.app/api/admin/resolve \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: de521e747d9e348e5f34b02ff0edafe3" \
  -d '{
    "bookings": [
      {"guest_id": "3d039cac-85f1-4196-829a-d1e29197483e", "actual_booking_date": "2025-06-15"},
      {"guest_id": "540a2c45-56b8-4d8e-bb03-67b381bda1e9", "actual_booking_date": "2025-06-18"},
      {"guest_id": "5f9b95e6-4294-4240-85a8-2ff2b14ab0b2", "actual_booking_date": "2025-06-20"}
    ]
  }'
```

---

## Verification sequence

1. `npm run dev` — server starts
2. Register user "alice" → prediction form shows horse dropdown, date, bet amount (10–100)
3. Submit prediction → locked, read-only view shown on reload
4. Register "bob" and "charlie" (need min 3)
5. Attempt to predict after 28 days → blocked with "betting window closed"
6. Run resolve curl with all 3 guest booking dates
7. `/results` — leaderboard shows scores, payouts, net; top 2 highlighted
8. Verify math manually for one row
