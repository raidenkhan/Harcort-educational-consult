# Harcourt Educational Consult

A marketplace connecting **students** with **approved tutors**. Tutors advertise the
courses they teach, our **admin team** verifies and approves every tutor before they
go live, and students find the right tutor and start a conversation.

**Initial focus: Ghanaian students — KNUST engineering courses first** (prices in
Ghana Cedis, GH₵). Built as a **modular monolith** on Next.js with a dedicated
service layer, so the same business logic can power a future mobile app.

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions) + TypeScript
- **Tailwind CSS v4**
- **Supabase** — PostgreSQL only (no Supabase Auth). Storage later
- **Self-hosted auth** — own `credentials` + `sessions` tables, scrypt-hashed passwords, httpOnly session cookies
- **Zod** — validation at every boundary
- npm (pnpm has symlink issues on Windows; **use npm**)

## Architecture

```
src/
├─ app/                 → App Router (marketing, auth, student, tutor, admin)
├─ services/            ← business logic — UI NEVER queries Supabase directly
│  ├─ auth/             → sign-up/sign-in actions, session & role guards
│  ├─ tutors/           → onboarding, approvals, service listings
│  ├─ courses/          → subject taxonomy + search
│  ├─ chat/             → /chat page: conversations, message thread, composer
│  ├─ admin/            → approval workflow (RPCs) + audit log
│  └─ moderation/       → reports & blocks
├─ lib/supabase/        → server / browser / admin clients, middleware helper
├─ components/          → Tailwind UI components
└─ types/               → shared domain types
```

**Security model — server-only data access with explicit scoping:**

- All queries run through the **service-role** client (server components/actions only) and
  scope explicitly: public reads return only `verification_status = 'approved'` tutors;
  user-scoped reads filter by the session profile id. The browser never talks to the DB
  directly.
- Passwords are hashed with **scrypt** (per-user salt, constant-time compare) and stored
  only in `credentials` (deny-all RLS — anon/authenticated roles get nothing).
- Sessions are opaque random tokens, **SHA-256 hashed at rest**, with a 30-day expiry and
  revocable via sign-out.
- Sign-in is throttled (5 failed attempts per 15 min, per email and per IP) to resist
  credential stuffing — with no Supabase provider rate limits to worry about.
- Approval is an atomic RPC (`admin_approve_tutor`) that also writes an immutable
  `admin_audit_log` entry. The DB re-verifies the acting admin's id against `profiles`.
- Self-registration as `admin` is impossible (`register_user` downgrades it).

## Getting started

### 1. Prerequisites

- Node.js 20+ and npm

### 2. Install

```bash
npm install
```

### 3. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Copy these from **Project Settings → API** into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (the `service_role` secret — **server only**)
   - `NEXT_PUBLIC_ADMIN_WHATSAPP` — the admin WhatsApp number (international
     format, digits only, no `+`, e.g. `233201234567`) used for the student
     **Contact admin** button. Leave empty to hide the CTA until set.
   - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — for **Sign in with Google**
     (server-only). Create them in Google Cloud Console → APIs & Services →
     Credentials → OAuth client ID → **Web application**, with the redirect
     URI `http://localhost:3000/api/auth/google/callback` (plus your
     production origin). Leave empty to hide the Google button.

   A template lives in `.env.example`.

### 4. Apply the database schema

Open **SQL Editor** in the Supabase dashboard and paste, **in order**:
1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_knust_engineering_courses.sql`
3. `supabase/migrations/0003_self_hosted_auth.sql`
4. `supabase/migrations/0004_tutoring_sessions.sql`
5. `supabase/migrations/0005_session_cancellations.sql`
6. `supabase/migrations/0006_password_resets.sql`
7. `supabase/migrations/0007_admin_conversations.sql`
8. `supabase/migrations/0008_admin_tutor_flag.sql`
9. `supabase/migrations/0009_google_signin.sql`

> 0001 creates the schema, RLS policies, admin RPCs, realtime publication,
> and the base taxonomy. 0002 adds the KNUST engineering course catalog.
> 0003 swaps Supabase Auth for self-hosted auth: `credentials` + `sessions`
> tables, `register_user` RPC, and admin RPCs that verify the acting admin
> by profile id. 0004 adds the tutoring timetable (dual attendance ticks);
> 0005 makes cancellations soft-deletes so the admin keeps an audit trail;
> 0006 adds admin-issued password-reset codes (no email needed);
> 0007 lets admins participate in conversations (student↔admin or
> tutor↔admin) so students can reach the Harcourt team in-chat.
> 0008 makes admin a privilege (`is_admin` flag) instead of an exclusive
> role; 0009 adds Google sign-in (`google_id` + `upsert_google_user`).
>
> A deeper orientation (history, conventions, gotchas) lives in `AGENTS.md`.

### 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

> There are **no confirmation emails** — sign-up creates your account and
> signs you in immediately.

### 6. Create an admin account

Admin accounts can't self-register (by design). After running the migration,
sign up normally, then promote yourself in the SQL editor:

```sql
-- in Supabase SQL editor, replace the email
update public.profiles
set is_admin = true
where id = (select profile_id from public.credentials where email = 'you@example.com');
```

Then sign in and visit `/admin` to review tutor applications.

> **Admins can also tutor (0008).** Admin is a privilege, not a role: set
> `is_admin = true` on any profile. A tutor who's also an admin (`role =
> 'tutor'` + `is_admin = true`) keeps their tutor onboarding, appears in the
> public tutor list (with the verified badge), and gets admin nav, admin
> chat, and the admin console.

## Auth modal

The landing page opens **sign in / sign up in a modal** (tabs, Escape/backdrop to
close) instead of redirecting. The standalone `/sign-in` and `/sign-up` pages still
exist for deep links. If the middleware bounces a signed-out user back to "/", the
modal opens automatically via `?auth=sign-in`.

## Sign in with Google

Email/password and Google sign-in share one account store (`credentials`). The
Google flow is a server-side OAuth authorization code exchange:

1. **Continue with Google** → `GET /api/auth/google` sets a CSRF state cookie
   and redirects to Google's consent screen.
2. Google redirects to `/api/auth/google/callback`; the state cookie is
   verified and consumed, the code is exchanged, and the ID token is verified
   (audience = our client id; unverified emails are rejected).
3. `upsert_google_user` finds the profile by Google id, else **links** the
   Google id to an existing account with the same email, else creates a new
   account with the role picked on the sign-up form. A normal session cookie
   is issued — the user lands on `/dashboard`.

On **both auth tabs** (sign in and sign up), Google joins use the same
student/tutor role picker as email sign-up; the choice rides inside the CSRF
state cookie (not the URL Google echoes) so it can't be forged, and it only
applies to **new** accounts — signing into an existing email/password account
keeps that account's role. Admin is still impossible through this path. The
browser never sees an ID token or a client secret.

## Roles & switching

Student and tutor are the two self-selectable roles (admin is a privilege set
by the team — see the admin section). You can switch between them anytime
from your **dashboard**: switching to tutor starts the tutor onboarding and
review flow; switching to student hides your tutor listing until you switch
back (your tutor profile isn't deleted).

## Chat

- **Students** tap **Contact tutor** on any approved tutor's card — signed-out
  visitors get the auth modal, signed-in students start a conversation and land
  in `/chat` with that tutor.
- `/chat` shows all conversations (other party's name + last-message preview),
  the thread, and a composer. New messages appear within ~5s while the page is
  open (polling refresh — realtime upgrade planned). On mobile it works like
  WhatsApp: a chats list you tap into, then a back button returns to the list.
- Threads show **Today / Yesterday / date** separators between messages.
- **Admins are verified**: admin accounts carry a Twitter-style verified
  checkmark (deep navy-purple) next to their name, and on every message
  they send.
  Admins start threads with any student or approved tutor via the **New
  message** panel at the top of `/chat`.
- Only the student and the tutor in the conversation can read or send messages
  (enforced server-side per message).

## Payments & admin contact

Students make and discuss payments **only with Harcourt admins — never with
 tutors**. This policy is shown to every student as a card on their dashboard
 and as a banner at the top of `/chat` (where payment talk would happen), with
 a **Contact admin on WhatsApp** button wired to `NEXT_PUBLIC_ADMIN_WHATSAPP`.

## Sessions & attendance

- **Tutors** schedule sessions (`/tutor` → Timetable) with students who
  contacted them.
- **Both sides tick** attendance when they meet (buttons unlock ~15 min before
  start; nobody can pre-confirm a meeting that hasn't happened).
- **Admins** see every session and both ticks on `/admin` → Attendance tracker,
  plus cancellations (who/when) — so it's verifiable that tutors are teaching.

## Try the core loop

1. Sign up as a **tutor** → fill your profile at `/tutor`, add courses you teach.
2. Sign up as an **admin** → visit `/admin` → **Approve** the pending tutor.
3. The tutor's profile instantly appears in the public "Approved tutors" section
   on the homepage (RLS flips visibility — no code involved).

## Scripts

| Command            | Description                |
| ------------------ | -------------------------- |
| `npm run dev`      | Start the dev server       |
| `npm run build`    | Production build           |
| `npm run start`    | Serve the production build |
| `npm run lint`     | ESLint                     |
| `npm run typecheck`| TypeScript check           |
| `npm test`         | Vitest unit tests (pure logic — no DB) |
| `npm run test:watch`| Vitest watch mode          |
| `npm run favicon`  | Regenerate favicon set from `src/app/icon.svg` |

## Testing & CI

- **Unit tests** live next to the code (`src/**/*.test.ts`) and cover the
  security-critical pure logic: scrypt password hashing, the brute-force
  sign-in throttle, Accra time formatting, auth validation schemas, and the
  admin-flag check. They need no database or env vars: `npm test`.
- **CI** (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every
  push to `main` and on pull requests. The `build` job is skipped until you
  add the Supabase repo secrets (Settings → Secrets and variables → Actions):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY` — the build prerenders the landing page, which
  reads the tutor list.

## Roadmap

- **Phase 0 ✅** — foundation: auth + roles, schema, RLS, admin approval loop
- **Phase 1 ✅** — KNUST engineering catalog, tutor profile pages, sessions/timetable with attendance ticks, soft-delete cancellations, admin attendance tracker, bento design refresh
- **Phase 1.5** — ✅ Google sign-in (0009); session reminders, calendar view, moderation UI remain
- **Phase 1.5b** — ✅ Vitest unit tests + GitHub Actions CI (lint/typecheck/test; build once Supabase secrets are set)
- **Phase 2** — realtime chat upgrade (page is live with polling; swap to Supabase Realtime subscriptions), unread counts
- **Phase 3** — payments (Stripe), bookings, reviews — chat goes behind the paywall
- **Phase 4** — mobile app (React Native / Expo) consuming the same backend
