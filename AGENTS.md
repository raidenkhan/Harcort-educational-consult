# AGENTS.md — Harcourt Educational Consult

> Orientation doc for AI agents (and humans) picking up this codebase. Read
> this first; it explains what exists, why it's shaped the way it is, and
> where the project is headed.

---

## 1. What this is

A tutor-marketplace web app for **Ghanaian students — KNUST engineering
courses first**. Students find approved tutors, start a conversation, and get
scheduled for sessions; the **admin team** approves tutors and verifies
attendance. Prices are in Ghana Cedis (GH₵). Built as a **modular monolith** on
Next.js with a dedicated service layer so the same logic can later power a
mobile app.

**Stack:** Next.js 16 (App Router, Server Components, Server Actions, Turbopack)
· TypeScript · Tailwind CSS v4 · Supabase **PostgreSQL only** (no Supabase Auth)
· self-hosted auth (scrypt + sessions) · Zod · lucide-react icons · **npm**
(never pnpm — symlink issues on Windows).

**Deployment repo:** https://github.com/raidenkhan/Harcort-educational-consult
(branch `main`). The app is hosted from there; `.env.local` is NOT committed.

---

## 2. Project history (chronological)

- **Phase 0 — foundation.** Full schema (profiles, courses, tutor_profiles,
  tutor_services, conversations, messages, admin_audit_log, reports), RLS,
  admin approve/reject RPCs, realtime publication, seed taxonomy.
- **Ghana pivot.** KNUST engineering course catalog added; currency switched
  to GH₵; copy re-targeted to Ghanaian students.
- **Auth modal + design system.** Sign in/sign up moved into a modal (tabs,
  Escape/backdrop to close, `?auth=` auto-open). Brand moved off blue →
  warm amber/gold (`brand-*`) + petrol teal (`petrol-*`) — later replaced by
  the purple scheme below. Fonts: Space Grotesk (display) + Inter (body),
  locally bundled. Emoji-free (lucide-react icons). Motion: marquee,
  staggered hero entrance, modal scale-in, button press feedback — all
  `prefers-reduced-motion` aware.
- **Purple re-brand.** Off amber/teal. `brand-*` = vibrant purple accent
  (#610B96, keywords/links/buttons); `petrol-*` = deep navy-purple ink
  (#1C0F2B, primary text + dark surfaces); `lilac-*` = soft light accent
  (#D1B4EF, secondary text on the dark footers); `slate-*` is a
  purple-tinted neutral ramp with `slate-900` = #1C0F2B. Monogram/favicon
  gradient regenerated (`npm run favicon`).
- **Self-hosted auth (big pivot).** Supabase Auth was dropped entirely because
  of email rate limits / confirmation emails. Now: own `credentials` table
  (scrypt-hashed passwords), `sessions` table (SHA-256-hashed opaque tokens,
  30-day expiry), atomic `register_user` RPC, brute-force throttle on sign-in,
  middleware = cheap cookie-presence check only. All data access moved to the
  **service-role client with explicit scoping** (browser never touches the DB).
- **Password reset without email.** Email recovery is unavailable (Supabase
  auth rate limits), so admins issue one-time 8-digit codes from `/admin`
  (hashed at rest, single-use, 30-min expiry) and share them out-of-band
  (WhatsApp/phone). Students redeem them at `/forgot-password` (throttled,
  no session required); redeeming revokes all of the user's sessions.
- **Bento design + tutoring sessions.** Admin/tutor/dashboard pages got bento
  grid backdrops. New `tutoring_sessions` table: tutors schedule sessions with
  students who contacted them; **both** tutor and student tick attendance when
  they meet; the admin's Attendance Tracker sees both ticks (proves tutors are
  working). Cancellations are now **soft-deletes** (status `cancelled` + who/when)
  so the admin keeps an audit trail.
- **Performance.** Home page tutor/course listings cached with
  `unstable_cache` (5-min TTL, tag-invalidated on admin approve/reject).
- **Contact-tutor flow + chat page.** The old "Contact tutor" CTA was just an
  auth-modal trigger — it never checked the session. It's now session-aware:
  signed-out visitors get the modal, signed-in students start a real
  conversation (re-using an existing one on duplicate) and land in `/chat`.
  `/chat` lists conversations with names + last-message previews, shows the
  thread, and has a composer. New messages appear via 5s `router.refresh()`
  polling (browser realtime is impossible without Supabase Auth/RLS session).
  Mobile is WhatsApp-style: a chats list you tap into — the thread opens with
  a back button (no dropdown); desktop keeps the two-pane sidebar + thread.
  Threads show "Today"/"Yesterday"/date separators (Accra day math in
  `lib/time.ts`) and optimistic sending stays.
- **Payment ground rules + admin contact.** Policy: students make and
- **Tutor directory (`/tutors`).** Public browse/search page: client-side text
  + subject filtering over the cached approved-tutor list, credential-rich
  cards (qualifications, per-course pricing), session-aware Contact button.
  All browse CTAs (dashboard, home nav + hero, chat empty state) point here.
  `BentoBackdrop` was softened (no hard square tiles — blurred panels +
  faint grid) and the home hero blurs `gradback.jpg` slightly to hide
  gradient banding.
- **Payment ground rules + admin contact.** Policy: students make and
  discuss payments ONLY with admins, never tutors. Rendered as a card on the
  student dashboard and a compact banner on `/chat` (student AND tutor roles)
  via `src/components/support/PaymentGroundRules.tsx` (an `audience` prop
  swaps the copy). The WhatsApp CTA links to `wa.me` from
  `NEXT_PUBLIC_ADMIN_WHATSAPP` (`src/lib/config.ts`) — the button hides until
  the number is configured.
- **Admin conversations + verified badge (0007).** Conversations gained a
  nullable `admin_id` (student/tutor sides became nullable too; a check
  constraint enforces exactly two participants; partial unique indexes dedupe
  admin threads). Admins start threads with any student or approved tutor
  from a **New message** panel on `/chat` (`startAdminConversation` action,
  `listChatTargetsForAdmin` query). Admin accounts show a Twitter-style
  **petrol verified check** (`src/components/ui/VerifiedBadge.tsx`) next to
  their name in the app header, dashboard, chat list, thread header, and on
  every message they send (bubbles matched by `admin_id`).
- **Admin-as-privilege (0008).** `profiles.is_admin` flag — admin becomes a
  privilege, not an exclusive role. A tutor with `is_admin = true` keeps the
  tutor onboarding + public listing (with verified badge) AND gets admin nav,
  admin chat, and the admin console. `profileIsAdmin()` (in
  `services/auth/queries.ts`, pure + unit-tested) is the single source of
  truth for admin checks; `requireRole("admin")` honors the flag.
- **Google sign-in (0009).** Authorization code flow, fully server-side:
  `GET /api/auth/google` sets a CSRF `state` cookie and redirects to Google;
  `GET /api/auth/google/callback` verifies the state cookie, exchanges the
  code, verifies the ID token (audience = our client id, email must be
  verified), then calls the `upsert_google_user` RPC — find-or-link-or-create
  against `credentials` (a Google sign-in on an existing email/password
  account LINKS the two; same profile, sessions and chats preserved). The
  callback then checks `profiles.onboarding_completed_at` (0010): brand-new
  Google emails get a one-time role pick on `/onboarding` (student or
  tutor), while existing/linked accounts go straight to `/dashboard` with
  their role untouched. Sessions use the exact same cookie path as email
  sign-in. Env: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (server-only).
  UI: `components/auth/GoogleAuthBlock.tsx` (button + divider + `?google_error=`
  surfacing, read via `useSyncExternalStore`), rendered inside the shared
  `AuthFields`, so the modal and standalone pages both get it.
- **Role switching (student ↔ tutor).** Students and tutors can self-switch
  roles from a dashboard card (`components/auth/RoleSwitcher.tsx` →
  `switchRoleAction`): validated by `switchRoleSchema` (admin is never
  switchable), the switch updates `profiles.role` and revalidates the cached
  tutor directory. A tutor who switches to student keeps their tutor_profile
  row (status untouched) but drops out of the public list — the list filter
  is `profiles.role <> 'student'` — and switching back re-lists them. Role
  is chosen at sign-up (email form) or on the one-time `/onboarding` screen
  (brand-new Google accounts, 0010 — no pre-auth picker on the auth tabs).
- **Tests + CI.** Vitest unit tests for pure logic (`src/**/*.test.ts`,
  node environment, `@` alias in `vitest.config.ts`): password hashing,
  sign-in throttle (extracted to `src/lib/auth/throttle.ts` with an injectable
  clock), Accra time helpers, auth zod schemas, `profileIsAdmin`. GitHub
  Actions (`.github/workflows/ci.yml`) runs lint + typecheck + test on every
  push/PR; the build job runs only when the Supabase secrets are configured
  in the repo (they're needed to prerender the landing page).

---

## 3. Architecture

```
src/
├─ app/                  → App Router: marketing, (app) dashboards, (auth) pages
│  └─ (app)/             → dashboard/ (all roles), tutor/, admin/ (role-gated)
├─ services/             ← ALL business logic. UI never queries Supabase directly.
│  ├─ auth/              → sign-up/sign-in/sign-out actions, getCurrentProfile,
│  │                        requireProfile / requireRole guards
│  ├─ tutors/            → approved-tutor listings (cached), onboarding forms
│  ├─ courses/           → taxonomy + search (cached)
│  ├─ sessions/          → tutoring timetable: schedule, confirm attendance
│  │                        (dual ticks), cancel (soft)
│  ├─ chat/              → /chat page: conversation list (names + last-message
│  │                        preview), thread, composer; polling refresh
│  ├─ admin/             → approval workflow (RPCs) + audit log
│  └─ moderation/        → reports & blocks
├─ lib/                  → supabase clients, auth primitives (password, session),
│  │                        time formatting (Accra), cn()
├─ components/           → ui/ primitives (Card, Button, Badge, Field(s),
│  │                        Container, BentoBackdrop), auth/, tutor/, sessions/
└─ types/                → shared domain types mirroring the DB
```

**Data-access pattern (critical):** server components/actions use
`createAdminClient()` (service-role) and scope every query explicitly to the
acting session profile. Pages gate with `requireRole("admin")` / `requireRole(
"tutor")` / `requireProfile()`. RLS exists but is **deny-all for private
tables** — the app layer is the real authorization boundary.

**Time handling:** all meeting times render in **Accra time** via
`src/lib/time.ts` (`Intl.DateTimeFormat` with `timeZone: "Africa/Accra"`).
Ghana is GMT with no DST, so strings are identical server & client — this
avoids both the server-timezone bug and hydration mismatches. Never
`toLocaleDateString` without an explicit timezone.

---

## 4. Database schema (migrations, in order)

All under `supabase/migrations/` — apply in the Supabase SQL Editor, in order,
and all are safe to re-run:

| Migration | Contents |
|---|---|
| `0001_init.sql` | Enums, tables (profiles → tutor_profiles → tutor_services, courses, conversations, messages, admin_audit_log, reports), RLS, admin RPCs, status-guard trigger, realtime publication, seed taxonomy |
| `0002_knust_engineering_courses.sql` | KNUST engineering course catalog (on-conflict upsert) |
| `0003_self_hosted_auth.sql` | Decouples `profiles.id` from `auth.users`; `credentials` + `sessions` (deny-all RLS); `register_user` RPC; `is_admin(uuid)`; admin RPCs keyed by `actor_id` + GUC (`request.harcot.actor_id`); status-guard trigger rewritten |
| `0004_tutoring_sessions.sql` | `tutoring_sessions` (tutor_profile_id, student_id, scheduled_at, duration_minutes, topic, location, notes, `tutor_confirmed_at`, `student_confirmed_at`) — deny-all RLS |
| `0005_session_cancellations.sql` | `session_status` enum (`scheduled`/`cancelled`) + `status`, `cancelled_at`, `cancelled_by` columns — soft delete for cancellations |
| `0006_password_resets.sql` | `password_resets` — admin-issued one-time reset codes (SHA-256 hashed, single-use, 30-min expiry), deny-all RLS |
| `0007_admin_conversations.sql` | Conversations gain `admin_id` (student/tutor sides nullable), 2-participant check constraint, partial unique indexes — admins can chat with students/tutors |
| `0008_admin_tutor_flag.sql` | `profiles.is_admin` flag — admin becomes a privilege, not an exclusive role; backfills legacy `role='admin'`; `is_admin(p_uid)` honors flag OR legacy role. A tutor with `is_admin=true` stays in the public tutor list with a verified badge |
| `0009_google_signin.sql` | `credentials.google_id` (partial unique index), `password_hash` nullable, `upsert_google_user` RPC — find-or-link-or-create for Google identities |
| `0010_google_onboarding.sql` | `profiles.onboarding_completed_at` (backfilled) — the Google callback sends brand-new accounts to `/onboarding` for a one-time role pick; the RPC stamps the flag when it LINKS an existing account |

Key security properties:
- **No Supabase Auth.** Passwords live only in `credentials`; sessions in
  `sessions` (token hash). `register_user` blocks self-promotion to admin.
- **Admin RPCs** (`admin_approve_tutor(actor_id, target_id, note)`) verify the
  actor's id against `profiles` inside Postgres, then set the GUC the
  status-guard trigger checks. App code passes the session profile id.

---

## 5. Code conventions

- **Server actions** (`"use server"` in `services/*/mutations.ts`) return a
  `{ error?, message? }` state object for `useActionState` forms; admin
  approve/reject throw on error (plain forms). Always `revalidatePath` the
  affected routes after mutation.
- **Validation:** Zod schemas live in `services/*/schemas.ts`; every server
  action parses form input at the boundary.
- **React Compiler purity:** lint enforces `react-hooks/purity` — **no
  `Date.now()`/`Math.random()`/impure calls inside component render**. Extract
  time-dependent logic to module-level functions (see `splitTimetable` in
  `src/app/(app)/tutor/page.tsx`) and pass snapshots down as props
  (see `SessionCard`'s `now` prop).
- **Caching:** public read queries use `unstable_cache` from `next/cache` with
  `tags` + a TTL (see `listApprovedTutors`, `listCourses`). Invalidate from
  server actions with Next 16's two-arg form
  `revalidateTag("tutors", "max")` (plus `revalidatePath("/")`) in every
  mutation that changes the cached data — admin approve/reject, tutor
  profile/service edits.
- **UI:** Tailwind v4; design tokens in `src/app/globals.css` — `brand-*`
  vibrant purple (#610B96), `petrol-*` deep navy-purple ink (#1C0F2B),
  `lilac-*` soft accents (#D1B4EF), purple-tinted `slate-*` (slate-900 =
  #1C0F2B), `font-display` Space Grotesk. **No emojis** — use lucide-react
  icons. Reuse `Card`/`Badge`/`Button`/`Container`/`Field(s)`.
  Interior pages get a `BentoBackdrop` (tone `purple`|`petrol` — vibrant
  purple vs deep-navy glows) inside a `relative overflow-hidden` wrapper.
- **Errors:** never expose raw DB errors to users beyond `error.message` in
  form states.

---

## 6. Environment & setup

`.env.local` (gitignored; template in `.env.example`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # REQUIRED — everything runs through this
NEXT_PUBLIC_ADMIN_WHATSAPP=   # student Contact-admin WhatsApp button (digits only, e.g. 233201234567)
```

Setup runbook:
1. `npm install`
2. Apply migrations 0001→0007 in the Supabase SQL Editor
3. `npm run dev` → http://localhost:3000 (no confirmation emails — sign-up
   signs you in immediately)
4. Promote yourself to admin:
   ```sql
   update public.profiles set is_admin = true
   where id = (select profile_id from public.credentials where email = 'you@example.com');
   ```
   (Admin is a privilege — `is_admin = true` on any profile. A tutor who's
   also an admin keeps their tutor listing and gets admin access too.)

Validation commands: `npm run lint` · `npm run typecheck` · `npm run build` ·
`npm test` (Vitest — unit tests for pure logic; no Supabase/DB involved).
CI runs lint/typecheck/test on GitHub (`.github/workflows/ci.yml`).
Icons: `src/app/icon.svg` is the source of truth for the brand favicon;
`npm run favicon` regenerates `favicon.ico` + `apple-icon.png` from it (sharp).
Never sed binary files (a rename pass once corrupted `favicon.ico`).
The dev machine is slow — give compiles 30–60s.

---

## 7. Known quirks & gotchas

- **Next 16.3 dev-mode middleware doesn't run in this environment** (project
  sits under `C:\Users\User`; a Turbopack-dev quirk). Production builds are
  fine (`ƒ Proxy (Middleware)` appears in the build). `next.config.ts` pins
  `outputFileTracingRoot` + `turbopack.root` to the project — **keep those**;
  removing them makes Next scan the home directory and breaks proxy discovery.
  Page-level guards are the authoritative defense and cover dev.
- **`next build` and `next dev` share `.next`** — running one after the other
  without `rm -rf .next` causes stale-chunk failures (sign-in "Failed to
  fetch"). Always clean-restart.
- **Stale environment variables beat `.env.local`.** Next.js never overrides
  an existing env var with a file value. If `SUPABASE_SERVICE_ROLE_KEY` (or
  the other Supabase vars) is set to the old placeholder in the shell,
  every DB call fails with "Invalid API key" and pages silently render empty
  (e.g. "No tutors yet"). Launch with
  `env -u SUPABASE_SERVICE_ROLE_KEY -u NEXT_PUBLIC_SUPABASE_URL -u
  NEXT_PUBLIC_SUPABASE_ANON_KEY npm run dev`, or unset the stale vars first.
- **Supabase Auth is NOT used** — never add `supabase.auth.*` calls back.
  Email "rate limits" don't exist here by design.
- Browser-automation agents (browser-use) have been unreliable in this
  environment — prefer curl + code inspection for verification.
- The institution is **Harcourt** Educational Consult (not "Harcot" — brand
  text everywhere is corrected to Harcourt). The GitHub repo
  (`Harcort-educational-consult`) and the local project folder
  (`harcot-educational-consult`) keep their original misspelled names, and the
  DB GUC `request.harcot.actor_id` in migration 0003 is deliberately unchanged
  to stay in sync with what's already applied to Supabase. Rename the
  repo/folder and migrate the GUC only if you want them to match.

---

## 8. Direction / roadmap

**Near term:**
- ~~Google sign-in~~ ✅ (0009 — authorization code flow via
  `/api/auth/google` + callback; linking + `upsert_google_user`).
- Realtime chat upgrade — a polling-based `/chat` page is live; switch the
  thread to `supabase_realtime` subscriptions once a Supabase-Auth-backed
  path exists (or keep polling — it's fine at this scale). Unread counts.
- Session reminders (email/WhatsApp) before scheduled meetings.
- Weekly calendar view of the timetable; live "now" ticker so the confirm
  button appears the moment a session starts.
- Cancellation-rate warnings on the admin page for tutors who cancel a lot.
- Admin moderation UI for `reports`.

**Later:**
- Payments (Stripe), bookings, reviews.
- Mobile app (React Native / Expo) consuming the same backend.
- CI build job currently skips until Supabase repo secrets are configured
  (see `.github/workflows/ci.yml`).
- Hosting: the GitHub repo is the deployment source (Vercel or similar);
  remember the `.env.local` vars must be set in the host's env.
