# CLAUDE.md — Horse

This file gives Claude Code context about the project. Read it at the start of every session.

---

## What this project is

**Horse** is a bachelor party prediction market. Players bet on which guest will book their hotel last and predict the exact date. Scoring is proportional to accuracy; payouts come from the shared pot.

Event: **Connor's Bachelor Party**
Wager: **$20 per player**

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (pages router) |
| Language | TypeScript (strict) |
| Database | Supabase (Postgres) |
| Auth | iron-session v8 (cookie sessions) |
| Passwords | bcryptjs (cost 12) |
| Deployment | Vercel |
| Package manager | npm |

**No CSS framework** — plain CSS in `styles/globals.css`.

---

## Project structure

```
Horse/
├── CLAUDE.md                  # this file
├── game.config.ts             # hardcoded event name, wager, guest list
├── next.config.mjs            # Next.js config (must be .mjs, not .ts)
├── lib/
│   ├── types.ts               # shared TypeScript interfaces
│   ├── session.ts             # iron-session v8 helper
│   ├── supabase.ts            # server-only Supabase client (service role key)
│   ├── supabasePublic.ts      # client-side Supabase client (anon key)
│   └── scoring.ts             # pure scoring/payout functions
├── pages/
│   ├── _app.tsx
│   ├── index.tsx              # prediction form (requires auth)
│   ├── login.tsx
│   ├── register.tsx
│   ├── results.tsx            # leaderboard (public, only when resolved)
│   └── api/
│       ├── auth/
│       │   ├── register.ts
│       │   ├── login.ts
│       │   └── logout.ts
│       ├── predict.ts         # upsert a prediction
│       └── admin/
│           └── resolve.ts     # mark event resolved (x-admin-secret header)
├── scripts/
│   └── seed.ts                # idempotent DB seed (run once after SQL setup)
├── styles/
│   └── globals.css
└── plans/                     # session plans in YYMMDD format
```

---

## Environment variables

All vars live in `.env.local` (gitignored). Never commit this file.

| Variable | Used in |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client only (`supabasePublic.ts`) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only (`supabase.ts`) |
| `SESSION_SECRET` | iron-session (must be 32+ bytes) |
| `ADMIN_SECRET` | `x-admin-secret` header on `/api/admin/resolve` |

---

## Database schema

```
events        id, name, status ('open'|'resolved'), created_at
guests        id, event_id → events, name, actual_booking_date DATE
users         id, username (unique), password_hash, created_at
predictions   id, user_id → users, event_id → events, guest_id → guests,
              predicted_date DATE, bet_amount INTEGER, submitted_at
              UNIQUE (user_id, event_id)
```

**Row Level Security is disabled** — all DB access goes through the service role key on the server.

---

## Scoring formula

```
E = |predicted_date − horse's actual_booking_date| in days
t = (submitted_at − events.created_at) in hours ÷ 24, capped to [0, 28]
M = 3 − (t / 14)    → ranges 3.0 (day 0) to 1.0 (day 28)
S = (W / (1 + E)) × M

Pot   = sum of all wagers
Top 1 = 0.75 × Pot
Top 2 = 0.25 × Pot
All others = 0

Tiebreaker: higher W → lower E → split evenly
Minimum 3 players required for results to be valid.
```

See `lib/scoring.ts`.

---

## Deployment

- **Production URL:** https://horse-five.vercel.app
- **Vercel project:** connors-projects-12c35c8d/horse
- **Supabase project:** https://pjopffkeopubnpjgbkrn.supabase.co
- **GitHub:** https://github.com/pan2gu3/Horse (auto-deploys on push to `main`)

---

## Common commands

```bash
npm run dev          # start dev server (requires .env.local)
npm run build        # production build (requires .env.local)
npm run seed         # seed DB with event + guests (idempotent, run once)
```

**Resolve the event** (input each horse's actual booking date):
```bash
curl -X POST https://horse-five.vercel.app/api/admin/resolve \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: de521e747d9e348e5f34b02ff0edafe3" \
  -d '{
    "bookings": [
      {"guest_id": "3d039cac-85f1-4196-829a-d1e29197483e", "actual_booking_date": "YYYY-MM-DD"},
      {"guest_id": "540a2c45-56b8-4d8e-bb03-67b381bda1e9", "actual_booking_date": "YYYY-MM-DD"},
      {"guest_id": "5f9b95e6-4294-4240-85a8-2ff2b14ab0b2", "actual_booking_date": "YYYY-MM-DD"}
    ]
  }'
```

**Guest UUIDs** (from seed — use these for the resolve command):
```
9adb8919-b0f9-45a0-b646-5809493d0b35  Alex
cda2130c-1f45-44a5-b552-04ac1f894389  Bryan
afc3799b-d6b4-44ae-8666-0c32a0d3eb75  Troy
```
Note: UUIDs change every time `npm run fresh` or `npm run seed` is run. Query Supabase for current values: `SELECT id, name FROM guests;`

---

## Key decisions & gotchas

- **`next.config.mjs` not `.ts`** — Next.js 14 doesn't support TypeScript config files.
- **iron-session v8**: `SessionOptions` (not `IronSessionOptions`), `getIronSession<T>()` with explicit type param. No module augmentation.
- **Supabase joins**: `.select('*, users(username)')` returns typed arrays that need `as unknown as RawRow[]` casting.
- **Lazy Supabase client**: Both `lib/supabase.ts` and `lib/supabasePublic.ts` use a Proxy to defer `createClient()` until first property access. This prevents build failures when env vars aren't available at module evaluation time.
- **Timing attack prevention**: Login always runs `bcrypt.compare` even when user not found (uses a dummy hash).
- **game.config.ts is seeded once**: DB is authoritative at runtime. Don't update config and re-seed (it's idempotent — it exits early if the event already exists).

---

## Plans

Past implementation plans live in `plans/` with the format `YYMMDD Plan Name.md`.
