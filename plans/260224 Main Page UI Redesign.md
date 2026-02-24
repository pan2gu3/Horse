# Plan: Main Page UI Redesign

## Layout (single page, public)

```
┌─────────────────────────────────┐
│  Connor's Bachelor Party        │
├─────────────────────────────────┤
│  Alex          3 betters · $120 │
│  Bryan         1 better  · $50  │
│  Troy          2 betters · $80  │
│                                 │
│         [+ Place Bet]           │
├─────────────────────────────────┤
│  Bet Log                        │
│  Feb 24  alice bet $50 on Alex  │
│  Feb 23  bob bet $30 on Troy    │
│  ...                            │
└─────────────────────────────────┘
```

## Modal states

| User state | Modal behavior |
|------------|---------------|
| Not logged in | No modal — error toast: "You have to be logged in to place a bet" |
| Logged in, no prediction | Prediction form (horse dropdown, date, wager $10–$100) |
| Logged in, already submitted | Read-only view of their locked prediction |

## Data (all loaded in getServerSideProps — page is public)

- Event: name, status, created_at
- Guests: id, name — joined with prediction counts + pot totals (aggregated in JS)
- All predictions: username, bet_amount, guest_name, submitted_at — sorted desc (bet log)
- Session user: id + username if logged in (nil otherwise)

## Files changed

### `pages/index.tsx`
- Remove redirect-to-login (page is now public)
- Keep redirect-to-/results if event resolved
- Load all predictions server-side for horse stats + bet log
- Client-side modal state (useState)
- Toast state (useState, auto-dismisses after 3s)
- "+ Place Bet" button: if no session → toast; else → open modal
- Log out button only shown if logged in (top right)

### `styles/globals.css`
- Modal overlay + card styles
- Toast styles (bottom center, auto-dismiss)

## Bet log format
`Feb 24, 2026  alice bet $50 on Alex`
Date formatted as: `MMM D, YYYY`
