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
events        id, name, wager_amount, status ('open'|'resolved'),
              actual_final_guest_id, actual_booking_date, created_at
guests        id, event_id → events, name
users         id, username (unique), password_hash, created_at
predictions   id, user_id → users, event_id → events, guest_id → guests,
              predicted_date, submitted_at
              UNIQUE (user_id, event_id)
```

**Row Level Security is disabled** — all DB access goes through the service role key on the server.

---

## Scoring formula

```
Score  = wager / (1 + |predicted_date − actual_date| in days)
       = 0  if wrong guest predicted

Payout = (player_score / sum_of_all_scores) × (wager × num_players)
```

If nobody guesses the correct guest, all payouts are 0. See `lib/scoring.ts`.

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

**Resolve the event** (after hotel is booked):
```bash
curl -X POST https://horse-five.vercel.app/api/admin/resolve \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: de521e747d9e348e5f34b02ff0edafe3" \
  -d '{"actual_guest_id": "<uuid from list below>", "actual_booking_date": "YYYY-MM-DD"}'
```

**Guest UUIDs** (from seed — use these for the resolve command):
```
3d039cac-85f1-4196-829a-d1e29197483e  Alex
540a2c45-56b8-4d8e-bb03-67b381bda1e9  Bryan
5f9b95e6-4294-4240-85a8-2ff2b14ab0b2  Troy
```

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
