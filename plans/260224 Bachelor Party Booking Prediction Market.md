# Plan: Bachelor Party Booking Prediction Market

## Context
Convert the existing minimal Horse TypeScript project into a full-stack Next.js web app. Players predict which bachelor party guest will book their hotel last and what date. Scoring rewards both accuracy and bet size. Deployed on Vercel with Supabase (Postgres) as the database.

---

## Phase 1: Reconfigure Existing Project for Next.js

**Why:** The current `tsconfig.json` uses `"module": "nodenext"` and `"rootDir": "src"` which are incompatible with Next.js. `package.json` uses `"type": "commonjs"` which must be removed.

**Files to replace entirely:**
- `package.json` — remove `"type": "commonjs"`, replace all scripts, add all deps
- `tsconfig.json` — replace with Next.js-compatible config (`"module": "esnext"`, `"moduleResolution": "bundler"`, `"noEmit": true`)
- Delete `src/index.ts` (no longer used)

**Install:**
```
npm install next@14 react@18 react-dom@18 @supabase/supabase-js iron-session bcryptjs
npm install --save-dev @types/react @types/react-dom @types/bcryptjs dotenv-cli tsx
```

**New scripts:**
```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"seed": "dotenv -e .env.local -- tsx scripts/seed.ts"
```

**Add to `.gitignore`:** `.next/`, `.env.local`

---

## Phase 2: Database Setup (Supabase)

Create a new Supabase project. Run the following SQL in order (circular FK between events↔guests requires the ALTER approach):

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  wager_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  actual_final_guest_id UUID,
  actual_booking_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

ALTER TABLE events ADD CONSTRAINT fk_events_actual_guest
  FOREIGN KEY (actual_final_guest_id) REFERENCES guests(id);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id),
  predicted_date DATE NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);
```

Do NOT enable Row Level Security — all DB access goes through service role key on the server side.

---

## Phase 3: Create `.env.local`

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SESSION_SECRET=<64-char hex from: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_SECRET=<another random string>
```

---

## Phase 4: Config & Library Files

### `game.config.ts` (project root)
Hardcoded event name, wager amount, guest list. `as const` for type safety. Seeded into DB once; DB is authoritative at runtime.

### `lib/types.ts`
TypeScript interfaces for `Event`, `Guest`, `User`, `Prediction`, `PredictionWithDetails`, `SessionUser`.

### `lib/session.ts`
iron-session v8 config + typed `getSession(req, res)` helper. Uses `getIronSession(req, res, options)` — NOT the v6 `withIronSessionApiRoute` wrapper (which no longer exists). Cookie: httpOnly, secure in prod, 7-day maxAge.

### `lib/supabase.ts` (server-only — service role key)
Supabase client with `persistSession: false`. Used in all API routes. Never import client-side.

### `lib/supabasePublic.ts` (client-side — anon key)
Standard Supabase client for client-side reads (e.g. guest list).

### `lib/scoring.ts`
Pure functions only. No DB calls.
```
Score = wagerAmount / (1 + |predicted_date − actual_date| in days)
      = 0  if player predicted wrong guest

Payout = (player_score / sum_of_all_scores) * (wagerAmount * num_players)
```
Edge case: if `scoreSum === 0` (nobody predicted correct guest), all payouts = 0.
`dateDiffDays` uses `Math.round()` to handle DST edge cases.

### `next.config.mjs`
Minimal: `reactStrictMode: true`. Must be `.mjs`, not `.ts` — Next.js 14 does not support `next.config.ts`.

### `styles/globals.css`
Basic reset + minimal form/button styles. No CSS framework.

---

## Phase 5: Pages & API Routes

### Auth pages
- `pages/register.tsx` — username + password form → POST `/api/auth/register` → redirect to `/`
- `pages/login.tsx` — same pattern → POST `/api/auth/login` → redirect to `/`

### `pages/index.tsx` (prediction form)
- Uses `getServerSideProps`: check session → redirect to `/login` if not logged in; redirect to `/results` if event resolved
- Loads event + guest list + user's existing prediction from DB server-side
- Shows guest dropdown + date picker; upserts on submit
- Log Out button → POST `/api/auth/logout` → redirect to `/login`

### `pages/results.tsx` (leaderboard)
- Public (no auth required)
- `getServerSideProps`: redirect to `/` if event not resolved
- Loads all predictions with user names, computes scores/payouts via `lib/scoring.ts`
- Table sorted by score descending; shows player, predicted guest, predicted date, score, payout

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/register` | POST | Validate → bcrypt.hash(pw, 12) → insert user → create session |
| `/api/auth/login` | POST | Lookup user → bcrypt.compare (always run to prevent timing attacks) → create session |
| `/api/auth/logout` | POST | `session.destroy()` |
| `/api/predict` | POST | Auth check → event open check → validate guest belongs to event → upsert prediction |
| `/api/admin/resolve` | POST | Check `x-admin-secret` header → validate inputs → update event status to 'resolved' |

**Timing attack prevention in login:** Always call `bcrypt.compare` even when user not found (use dummy hash). This prevents username enumeration via response time.

---

## Phase 6: Seed Script

`scripts/seed.ts` — loaded via `dotenv-cli` so `.env.local` is available. Idempotent: checks if event already exists by name, exits early if so. Inserts event + guests and prints guest UUIDs to console (needed later for the resolve curl command).

---

## Phase 7: Vercel Deployment

1. Commit + push all files to `main` (`git push origin main`)
2. Go to vercel.com/new → import `pan2gu3/Horse`
3. Auto-detects Next.js — accept defaults
4. Add all 5 env vars from `.env.local` in the Vercel dashboard
5. Deploy

On every subsequent push to `main`, Vercel auto-redeploys.

**After deploy — resolve the event:**
```bash
# Get guest UUIDs from Supabase dashboard SQL: SELECT id, name FROM guests;
curl -X POST https://horse-xxx.vercel.app/api/admin/resolve \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -d '{"actual_guest_id": "uuid", "actual_booking_date": "2025-06-20"}'
```

---

## Implementation Notes (lessons learned)

- **`next.config.ts` is not supported in Next.js 14** — must use `.mjs` or `.js`
- **iron-session v8 API**: uses `SessionOptions` (not `IronSessionOptions`), and `IronSession<T>` requires an explicit type parameter. No module augmentation needed.
- **Supabase join type casting**: Joined query results from `.select('*, users(username)')` don't perfectly match typed interfaces — use `as unknown as RawRow[]` to cast safely.
- **Build without `.env.local`**: `next build` will fail locally without env vars because Supabase client is created at module eval time. This is expected — Vercel sets env vars before building.

---

## File Creation Order

1. Replace `package.json`, `tsconfig.json` → run `npm install`
2. Delete `src/index.ts`
3. `game.config.ts`
4. `lib/types.ts`
5. `lib/session.ts`
6. `lib/supabase.ts`
7. `lib/supabasePublic.ts`
8. `lib/scoring.ts`
9. `next.config.mjs`
10. `styles/globals.css`
11. Run SQL in Supabase
12. Create `.env.local`
13. `scripts/seed.ts` → run `npm run seed`
14. `pages/_app.tsx`
15. `pages/api/auth/register.ts`
16. `pages/api/auth/login.ts`
17. `pages/api/auth/logout.ts`
18. `pages/register.tsx`
19. `pages/login.tsx`
20. `pages/api/predict.ts`
21. `pages/api/admin/resolve.ts`
22. `pages/index.tsx`
23. `pages/results.tsx`

---

## Verification (End-to-End Test Sequence)

1. `npm run dev` — confirm server starts on localhost:3000
2. `/register` — create user "alice" → confirm redirect to `/`
3. Prediction form — guest dropdown populated from seed, event name visible
4. Submit prediction — confirm success message + form pre-fills on reload
5. Incognito tab — register "bob", submit different prediction
6. Log out → log in → confirm prediction persists
7. `/results` while open → confirm redirect to `/`
8. Run resolve curl command with a valid guest UUID
9. `/results` — leaderboard appears with scores and payouts; verify math manually
10. `/` after resolution → confirm redirect to `/results`
