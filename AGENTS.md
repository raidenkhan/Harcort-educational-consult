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
- **Password reset — self-service by email, admin fallback.** With Resend in
  place, a locked-out user can now request a reset code themselves on
  `/forgot-password` (two-step: request → redeem). `requestResetCode` is
  public, throttled per-email + per-IP (same `createThrottle` as sign-in),
  and returns a **generic** reply whether or not the account exists (no email
  enumeration) — the code is emailed automatically when the account is real.
  The admin out-of-band path still exists (`generateResetCode` from `/admin`,
  hashed at rest, single-use, 30-min expiry) for users who signed up with a
  fake/no email. Redeeming revokes all of the user's sessions. No email
  verification at signup (by design — signup stays frictionless).
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
- **Per-request session format + paywall (0024).** The session format is
  chosen inside the request dialog and stored on `tutor_requests.session_mode`
  — it is per tutor+course, so a student can want group sessions with one
  tutor and one-on-one with another. It is never shown at sign-up or on the
  dashboard (`profiles.session_mode` is legacy and no longer read). Sending a
  request now opens the **paywall immediately**: the first 50% is payable
  straight away (`commitAndStartCheckout` accepts a `pending` request; the
  tutor's acceptance governs scheduling, not payment). A student who can't pay
  in full uses `PaymentPlanRequestButton` → `requestPaymentPlan`, which opens
  (or re-enters) their admin conversation in `/chat` with the course, tutor,
  amount and student code pre-filled.
- **Course directory + real KNUST curriculum (0026).** `/courses` is now a
  three-step directory — **programme → level → semester → course** — mirroring
  how KNUST students find their course. The mechanical curriculum comes from
  the programme data: codes (MATH 151, ME 255…), credit hours, levels 100–400
  and both semesters. `courses.code` / `credits` / `semester` back it; the
  generic topic rows ("Fluid Mechanics", no code/year) were removed only where
  nothing referenced them. "Engineering Mathematics" / "Engineering Sciences"
  are no longer offered as programmes (they're service subjects), though their
  rows stay in the DB for tutor offers. `levelsInCourses` /
  `coursesForTerm` / `levelLabel` live in `courseTaxonomy.ts` and are
  unit-tested; `CourseDirectory.tsx` renders the flow, and the home band plus
  the dashboard course cards now show code + credit hours.
- **Catalog rebuilt from the department's own site (0030).** 0026's seed
  turned out to be largely invented (e.g. "ME 159 Applied Electricity" — the
  real ME 159 is Technical Drawing). 0030 re-seeds FOUR programmes —
  Mechanical, Industrial, Marine and Automobile Engineering — straight from
  mech.knust.edu.gh's published tables (HTML + the brochure PDFs the search
  index exposed), codes/credits/semesters/levels exactly as printed, including
  Mechanical's Year-4 specialisation options. `ENGINEERING_FIELDS` now leads
  with those five department programmes (the other college fields stay
  appended for existing tutors). Shared foundation courses are seeded PER
  PROGRAMME (the directory browses programme → course); duplicate-code site
  inconsistencies are handled with one coded + one NULL-coded row. Aerospace
  Engineering is listed by the department but publishes no structure, so it
  is deliberately unseeded.
- **Library merged into Courses.** `/library` and `/courses` were two doors
  into the same thing — the catalogue knew each course's code, credits and
  tutors; the library knew each course's Drive folder and video playlists.
  `/library` is now a **permanent redirect to `/courses`**, `ProgramDirectory`
  is deleted, and Library is gone from the navs and the sitemap. The
  programme → level → semester → course flow ends on a course page that shows
  the Drive notes folder, the tutorial videos and the available tutors
  together (`DriveMaterials.tsx`). The static Drive tree is indexed by
  **normalized course code** in `src/services/library/courseMaterials.ts`
  (upper-case, single-spaced — the same normalization as the catalogue), with
  one deliberate alias: the `ME 168` folder maps to the catalog's `ME 158`.
- **Semester-aware catalogue.** The home band keeps **one level open at a
  time** (`LevelRail`) and adds a **Semester 1 / Semester 2 segmented control**
  with counts; the chosen term persists while switching levels, a level with
  only one term shows a static label, and a catalogue with no semester tags
  skips the control entirely. The `/courses` directory **stacks both
  semesters** as headed, counted sections (plus "Runs in both semesters" for
  null-semester courses) rather than toggling one at a time. The splitting is
  `splitBySemester()` in `courseTaxonomy.ts`, unit-tested — a null-semester
  course appears **once**, never duplicated into both terms.
- **Per-format pricing + tutor-added courses (0031).** A tutor charges
  differently for a group session than for one-on-one, but `tutor_services`
  had one `price`, so every offering collapsed to a single number. It now
  carries `price_group` and `price_one_on_one`, matching
  `tutor_requests.session_mode` (0024). **Either may be NULL**, which means
  "not offered in that format": the request dialog disables that format and
  the paywall raises `format_not_offered` rather than quietly charging the
  other price. The legacy `price` column is kept and still written
  (`coalesce(one_on_one, group)`), and readers prefer the per-mode columns via
  `servicePrice()` in `services/tutors/pricing.ts` — so the app works before
  and after the migration. Migration 0031 also backfills **both** columns
  from `price`, keeping every live group request payable. Separately, a tutor
  can add a course the catalog is missing (course **code required**, shape-
  validated to reject prose, normalized so "me 158" reuses "ME 158"); it is
  created `is_approved = false`, usable by that tutor immediately but hidden
  from the public directory until an admin approves it on `/admin/courses`
  (`PendingCoursesPanel`). Rejecting deletes the course and the tutor's offer
  for it. Price copy has one source of truth: `components/tutors/ServicePrice`
  (`priceTag`, `servicePriceSummary`, `ServicePrice`, `hasDistinctFormatPrices`)
  — a pre-0031 row renders a single `/semester` price rather than printing the
  same number twice.
- **Payment plans + part-payment links (0032).** 0029 could record a part
  payment, but only against an existing agreement — and a student who cannot
  pay in full never gets one: they hit the paywall, ask the admin for a plan,
  and the flow dead-ended. `engagements.expected_full_payment_at` now stores
  **the date the balance will be settled** (set when the admin opens the plan,
  movable later, shown to the student, flagged when overdue), and
  `payment_requests` stores an **admin-issued part-payment link**: the admin
  picks an amount, the student gets a one-time URL, and paying it charges
  exactly that amount through Paystack. The token is stored as a **SHA-256
  hash** (same rule as sessions and password-reset codes) and is **single-
  use**; `payments.payment_request_id` ties the charge back to the link so the
  webhook marks it paid in the same transaction that applies the money.
  Nothing here moves money by itself: a link only permits an amount the admin
  already approved, and `payment_apply_verified_payment` (0029) still re-checks
  it against the installment under a lock. `/pay/[token]` is a standalone page
  (a WhatsApp link is often opened signed-out on a new device) and
  `requireProfile(next)` + `safeNextPath` bring the student back after
  sign-in. Admin console gained student tiles (total, paid in full, remaining),
  the plan queue, promise dates and the links list.
- **Brochure corrections (0033).** The department's own BSc Mechanical
  Engineering brochure is authoritative. It adds the two courses 0030 dropped
  because their codes were duplicated in the printed tables:
  `EE 252 Electrical Engineering Machines` (Year 3, Semester 2, 2 credits) and
  `ME 496 Human Factors and Ergonomics` (Year 4, Semester 2, 3 credits).
- **Admin Performance tab (0025).** `/admin/analytics` shows money in/out
  (collected, paid out, queued, platform fees, outstanding installments), the
  request funnel (acceptance rate, average response time), sessions vs dual
  attendance, people counts, tutor performance, and first-party traffic. The
  traffic is recorded by `POST /api/track` + `PageViewTracker` into
  `page_views`: no third-party script, no IPs/user agents/query strings, DNT is
  honoured, admin and API paths are excluded, and the visitor cookie is an
  opaque UUID hashed with `ANALYTICS_SALT` before storage.
- **Email notifications (Resend).** `src/lib/email/` — fail-safe transactional
  email: new chat messages (recipient gets the sender + preview + chat link),
  session scheduled/cancelled, attendance ticks (admins emailed — proves
  tutors are working), new tutor application (admins), approve/reject outcome
  (tutor), and password-reset codes go **straight to the student's inbox**.
  Everything runs after the response via Next's `after()` so sending never
  slows the primary action; when `RESEND_API_KEY` is unset every send is a
  silent no-op. Env: `RESEND_API_KEY`, `EMAIL_FROM` (verified-domain sender),
  `APP_URL`. **`deliver()` must read the SDK result, not just the absence of a
  throw:** resend-node v6 RESOLVES on an API error with `{ data: null, error }`,
  so the old `await client.emails.send(...)` made every rejection look like
  success — `/forgot-password` told students a code had been sent when the
  send had been refused. The returned error is logged raw and mapped by
  `lib/email/errors.ts` (`emailErrorReason`, unit-tested) because Resend's
  own wording for an unverified domain names the account owner's address, and
  that string reaches the student. `onboarding@resend.dev` only delivers to
  that owner's inbox — a verified domain (`EMAIL_FROM`) is what turns student
  email on.
- **SMS notifications (Arkesel).** `src/lib/sms.ts` — the text-message twin of
  the email module, and the only channel that reliably reaches a Ghanaian
  student. Every send is logged to `sms_messages` (0027) with the provider's
  message id, so Arkesel's batched delivery report (`?sms_id=&status=`, ~10
  minutes later) lands on the same row; `/api/sms/delivery` is the receiver.
  Two guards make it safe to run unattended: the UNIQUE `dedupe_key` is the
  atomic claim (a scheduled job that runs twice texts nobody twice), and a
  daily cap, a per-number cap and a balance check bound the spend. The
  flows: session reminders (both parties), session scheduled/cancelled,
  tutor request sent/answered, payment received, installment due/overdue, and
  password-reset codes. `profiles.sms_opt_out` is the user's kill switch and
  is checked before every message. `SMS_SANDBOX=1` (legacy name
  `ARKESEL_SANDBOX=1`) makes sends free and
   undelivered — the same trick as Paystack's test mode. The reminder job runs
  from `.github/workflows/reminders.yml` (every 15 min → `/api/sessions/remind`,
  `CRON_SECRET`-guarded) because Vercel's free plan only allows daily crons.
  The layer is provider-neutral: `SMS_PROVIDER` picks the adapter
  (`arkesel` today; `mnotify`/`hubtel` named but not yet wired), and the
  neutral `SMS_*` env names fall back to the original `ARKESEL_*` ones.
- **Tests + CI.** Vitest unit tests for pure logic (`src/**/*.test.ts`,
  node environment, `@` alias in `vitest.config.ts`): password hashing,
  sign-in throttle (extracted to `src/lib/auth/throttle.ts` with an injectable
  clock), Accra time helpers, auth zod schemas, `profileIsAdmin`. GitHub
  Actions (`.github/workflows/ci.yml`) runs lint + typecheck + test on every
  push/PR; the build job runs only when the Supabase secrets are configured
  in the repo (they're needed to prerender the landing page).
- **Animated gradient + floating nav.** `components/ui/AnimatedGradient.tsx`
  renders five drifting colour blobs over a purple gradient with a soft blob
  that eases toward the cursor (skipped entirely for
  `prefers-reduced-motion` and coarse pointers). It backs the landing hero,
  the `/tutors` hero band and the auth pages. The landing hero is exactly one
  screen tall (`min-h-screen`, plus `supports-[height:100svh]:min-h-[100svh]`
  so mobile browser chrome sliding in and out can't resize it), so the first
  scroll reveals the marquee band instead of half a hero.
  `components/navigation/FloatingNav.tsx` replaced every sticky header
  (landing, `/tutors`, app shell, forgot-password): a fixed glass pill that
  condenses away on scroll-down and glides back on scroll-up, with
  `focus-within` forcing it back for keyboard users. Because it is fixed it
  takes no flow space — every page using it needs its own top offset (the app
  shell's `main` carries `pt-20`, the public heroes `pt-28`/`pt-32`).
- **Perspective grid horizon + the sheet seam.** The fade-to-canvas that used
  to sit under the landing hero smeared the gradient into the marquee band and
  left the subject chips sitting on a wash. It is gone. The hero now ends on
  the gradient, and the marquee band is an opaque canvas surface with a rounded
  top (`relative -mt-6 rounded-t-[1.75rem] bg-canvas`, larger at `sm`) pulled
  up over it — the light page starts there, and `/tutors` uses the same seam on
  its directory section. `components/ui/PerspectiveGrid.tsx` supplies the 3D
  horizon (rotated CSS plane + purple top beam), retuned for the light canvas:
  ink-toned lines instead of the brief's white-on-dark, so body text and white
  cards keep their contrast. `BentoBackdrop variant="grid"` renders it, so
  every interior page inherits it; pages whose top is covered by a hero
  gradient (landing, `/tutors`) set `variant="smooth"` and place bands
  deliberately below the hero — the landing uses three, the  beam on the first one only so there is a single light source. The landing
  bands **decay** — `strength` 1 / 0.55 / 0.3 from top to bottom — so the
  horizon recedes with the page's depth instead of repeating at full strength;
  `PerspectiveGrid`'s `strength` prop scales both the line alpha and the beam
  opacity (inline styles — see the Tailwind gotcha below). The plane shimmers:
  `grid-pan` slides `background-position` one seamless 56px tile per 26s while
  `grid-breathe` dims the band 0.65 → 0.45 → 0.65 over 13s — both disabled by
  `motion-reduce:animate-none` plus the global reduced-motion override. If you
  change the plane's `backgroundSize`, change the `grid-pan` keyframe to match
  or the loop snaps.
- **Security pass.** Real security headers from `next.config.ts` (a
  `default-src 'self'` CSP, `X-Frame-Options: DENY`, nosniff,
  Referrer-Policy, Permissions-Policy, HSTS) plus `poweredByHeader: false`
  and no production source maps. The unused browser Supabase client was
  deleted with its `@supabase/ssr` dependency, so **no Supabase key is
  reachable from the browser** (`NEXT_PUBLIC_SUPABASE_ANON_KEY` is gone).
  Every attacker-controllable value in an email template now goes through
  `escapeHtml()` and action links are forced to `http(s)`. Admin gates were
  switched to `profileIsAdmin()` — three call sites still tested
  `role === "admin"`, which silently locked a tutor with `is_admin` out of
  the admin actions and admin chat. `/onboarding` joined the middleware
  matcher. Chat actions validate with Zod (`services/chat/schemas.ts`) and
  free-text fields gained max lengths. CI gained a `gitleaks` job over full
  history (`.github/workflows/ci.yml`).
- **100% upfront + admin-recorded payments (0029).** The 50/50 split is gone:
  `create_payment_engagement` now writes ONE installment for the full
  semester fee, and the paywall copy says so everywhere. Students who can't
  pay in full get TWO routes to the admin — WhatsApp (`adminWhatsappUrl`,
  message pre-filled with course + fee) and the in-site payment-plan chat —
  and the admin records each out-of-band payment from the admin console
  (`admin_record_part_payment`): a `payments` row with a synthetic
  `ADMIN-…` reference, applied to the installment's `paid_amount`, activating
  the agreement immediately (recording one IS the admin approving the plan).
  Paystack's webhook apply also tolerates partial amounts now; activation
  still passes at ≥50% collected, and `request_payout` still refuses until
  every installment is fully settled. The admin console gained a combined
  payment log (Paystack + admin-recorded, source-badged) and the payout
  transfer button became a two-step confirm (amount shown, real-money
  warning) before the live-key switch.
- **Landing-page scroll performance (measured, then fixed).** The complaint was
  that scrolling the homepage felt slow. It was measured, not guessed at:
  headless Chrome over raw CDP, real GPU (`ANGLE (Intel, Intel HD Graphics 620,
  D3D11)` — verified, not SwiftShader), 1366×900, **time-driven** scroll at
  1100 px/s so every run covers the same path, A/B passes **interleaved** and
  reported as **median of 3** (this machine's background load swings single
  runs by 2×, so one-shot numbers are meaningless). Two controls:
  `prefers-reduced-motion` (everything off) and injecting CSS to hide one
  layer at a time. Findings and fixes, in order of size:
  1. **The four always-on `BeamCard` border beams** were the first big cost —
     25 → 40 fps and `RecalcStyleDuration` 2.27 s → 0.26 s with them disabled.
     The package animates a registered `conic-gradient` angle *plus* a
     blur/hue/brightness filter on the card and its `::after`, so every active
     beam repaints and invalidates style every frame. All four are now
     `mode="hover"`; keep "always" for at most ONE above-the-fold card.
  2. **The WebGL hero (`FloatingLines`) was the remaining cost, and it was
     the whole of it.** With everything else already fixed, hiding only the
     canvas took p95 from **66.7 ms → 17.1 ms** and janky frames **27.2% →
     1.7%**. Its fragment shader evaluates every line of every wave for every
     pixel (each with `sin`, `exp`, `log`, `rotate` = 2 sin + 2 cos, and a
     divide), so cost = total line count × pixels × fps. Three knobs, one
     build: `lineCount` 8/12/16 → **6/9/12** (36 → 27 lines), pixel ratio
     1.25 → **0.75** (rendered below 1:1 and upscaled by the compositor —
     invisible on a smooth light field, −44% fragments), 30 → **24 fps**.
     Result: **60.1 fps, p95 16.8 ms, 0% janky frames**, i.e. at the display
     refresh cap and *at parity with the reduced-motion control*. The canvas
     is now free.
  3. Supporting fixes: the canvas is transparent with **premultiplied alpha**
     instead of `mix-blend-mode: screen` (a blend mode on a full-screen layer
     forces the compositor to re-blend the entire hero every frame); the
     render loop is gated by an `IntersectionObserver` so the shader stops
     once the hero scrolls away (it used to run for the whole life of the
     page, competing with the syllabus, tutor list and footer); `antialias:
     false`; and the two `backdrop-blur` layers sitting over the animating
     canvas are gone.
  Net: **42 fps / p95 54 ms / 18% janky frames → 60 fps / p95 17 ms / 0%**.
  The benchmark scripts live outside the repo (they need a running prod
  build); re-create them from this note if the hero is ever retuned — the
  performance contract at the top of `FloatingLines.tsx` lists the knobs.
- **Sandbox honesty, per-course share links, and the "received null" fix.**
  Three separate complaints, one release. (1) **SMS "sent but never
  delivered"** was not a bug in the send path: production was running Arkesel
  in **sandbox**, which returns a real-looking UUID for a message it throws
  away, so the log said `sent` and no handset ever rang. `SendResult` now
  carries `sandbox`, a sandbox send is logged as `skipped` with
  `delivery_status = 'SANDBOX'` (0027's check allows both — no migration),
  it does **not** count toward the daily cap, `/admin/sms` shows a red-flag
  banner, a per-row "Sandbox — not delivered" badge, a `sandboxToday` count
  and the sender ID, and the test button reports the sandbox as an error
  instead of a success. Fix is still env-only: unset `SMS_SANDBOX` (or `0`)
  in Vercel. (2) **"received null"** was Zod's developer message
  (`Invalid input: expected string, received null`) leaking to a user, which
  happens when a REQUIRED control is missing from the `FormData` (posted
  before hydration, a password manager calling `form.submit()`, an extension
  that dropped an input). `formText()` in `lib/forms.ts` collapses that to
  `""` so the schema's own human message wins; it is applied at every auth
  entry point (sign-in, sign-up, reset redemption) and the tutor profile
  form. Sign-in also now names the real problem for a Google-only account
  ("This account signs in with Google…") instead of "invalid email or
  password", and `signUpAction` refuses a null profile id rather than
  creating a session for null. `src/app/error.tsx` is new: an unexpected
  exception now shows a retry card with the error digest instead of Next's
  raw 500 screen. (3) **Share links are per course as well as per tutor** —
  `/tutors/HC-T-…` still opens the whole profile, and `?course=` (the course
  **code** when it has one, the row id otherwise) opens that offering first,
  highlights it and preselects it in the request dialog; an unknown value
  falls back to the plain profile instead of 404ing. `services/tutors/share.ts`
  (`tutorSharePath`, `courseParamMatches`, unit-tested) owns the rule, the
  tutor dashboard has a **Copy link** button on each service row
  (`CopyServiceLink`), and every row's Request button now opens on **its own**
  course (it used to default to whichever offering happened to be first).
- **No more profile-wide semester rate.** The tutor dashboard used to ask for
  one on the left (About you) while the right column asked for a one-on-one and
  a group price per course — two ways to say the same thing, and the left one
  won on the public card. The field is gone; a tutor prices each course, per
  format, and the public "From GH₵…/semester" headline is now the **cheapest
  format they actually offer** (`TutorExplorer`, `/tutors/[code]`), with
  `tutor_profiles.rate_per_semester` kept only as a fallback for rows that
  predate 0031. `submitTutorProfile` omits the column when the form carries no
  rate, so saving a bio can never wipe a legacy rate.
  **And the "received null" class is closed where it was still open:** the
  three `newCourse*` fields in `tutorServiceSchema` were `.optional()` but not
  null-safe, so saving a course while the "add a new course" panel was hidden
  posted `null` for them and failed with Zod's developer message — the exact
  error a tutor hit. They now go through `optionalLine()` (preprocess →
  `.optional()`), `createSessionSchema`'s `topic`/`location` go through
  `optionalText()`, and `tutors/schemas.test.ts` pins the null and blank shapes.
- **Share links that survive real chat apps, and previews that name the
  course.** Two complaints, one root cause each. (1) **"the first links lead
  to 'this page was not found'"** — `/tutors/[code]` compared the URL segment
  to `profiles.public_code` exactly, so the variants a messaging app produces
  (`/tutors/hc-t-epbrrc` lowercased, `/tutors/HC-T-EPBRRC%20` with the space
  WhatsApp appends when it auto-links a sentence) queried Postgres with a value
  that cannot match and rendered the not-found UI.
  `normalizeTutorCode()` in `services/tutors/share.ts` now decodes safely
  (a truncated `%` escape must not 500), strips every whitespace class
  (including NBSP/zero-width) and upper-cases, and `getTutorByPublicCode`
  normalises **before** the `unstable_cache` key so all variants share one
  entry. `/tutors/[code]/not-found.tsx` replaces the bare Next 404 with an
  explanation and a directory link. (2) **A WhatsApp preview showed a bare
  URL** because the profile had no Open Graph tags.
  `generateMetadata` now emits `og:*` + `twitter:summary_large_image` + a
  canonical, and names the **course** when the link carries `?course=`
  ("ME 255 — Thermodynamics with Kofi Mensah — GH₵60/semester"). The image is
  rendered by `/api/og/tutor` (`ImageResponse`) from query params only — no DB
  read, `immutable` caching — and uses **`GHS` not `GH₵`** because the card's
  bundled font has no cedi glyph (U+20B5 renders as a box). `SITE_URL` now
  falls back to `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` before
  localhost, so a deployment without `APP_URL` still emits real origins in
  canonicals and image URLs.
- **Return-to-course after auth, and semester-grouped student courses.** A
  signed-out student who taps **Request** on a per-course share link used to
  land on `/dashboard` after signing in, with no way back to the course they
  were looking at. `RequestTutorButton` now builds
  `/tutors/HC-T-…?course=<course>&request=1` and hands it to the auth modal
  (`open(tab, next)` — the modal's `nextOverride`; the form posts it and
  `safeNextPath` validates it), so after sign-in they land on **that tutor's
  that course** with the request dialog already open. The marker is stripped
  from the URL after it fires so a refresh does not reopen it. Separately, the
  student dashboard's "Courses for your program" list was one flat year; it now
  uses `groupCoursesForPicker` for "Level 200 · Semester 1 / Semester 2 / Both
  semesters" headings with per-section counts — the same vocabulary as
  `/courses`.
- **Paystack fees are charged to the student (0034).** Paystack deducts its
  processing fee from what it collects, so a GH₵60 course netted Harcourt
  GH₵58.83. Checkout now charges `course fee + Paystack fee` and the agreement
  receives exactly the course fee, so tutor earnings, payouts and the 0029
  amount guards stay net. Ghana's published schedule is **1.95%, no flat fee,
  no cap**, encoded in `services/payments/fees.ts` (`checkoutTotal`,
  `paystackFeeConfig`; env-tunable, pure + unit-tested) and shown on the
  paywall, `/pay/[token]`, and the dashboard pay button. The fee is stored on
  the payment row (`payments.fee_amount`) at checkout and the webhook verifies
  the gross charge against **that row**, then passes the **net** to
  `payment_apply_verified_payment`. A database without 0034 detects the missing
  column and absorbs the fee (charge = net) instead of breaking checkout.
- **Tutor profile photos.** Tutors upload a photo from the dashboard's "About
  you" card (`AvatarUploadForm` → `uploadTutorAvatarAction`); it is validated
  (JPG/PNG/WebP, ≤2 MB), resized to a 512×512 cover WebP with `sharp`, stored
  in the PUBLIC `tutor-avatars` bucket and written to **`profiles.avatar_url`**
  — the column Google sign-in already fills, so no migration was needed. The
  upload runs server-side (no Supabase key in the browser); the browser reads
  it through `next/image` (the Supabase host is in `images.remotePatterns`, so
  the CSP `img-src 'self'` still holds). `components/ui/TutorAvatar` renders
  the photo or a monogram fallback, and only shows an IMAGE for our own bucket
  URLs (`isTutorAvatarUrl` in `lib/supabase/storage.ts`) — a Google avatar URL
  is not in the image allowlist, so it falls back to initials rather than a
  broken `<img>`. The bucket is created on first use (`ensureTutorAvatarBucket`),
  and replaced photos delete their old object. Avatars show on the `/tutors`
  directory cards, the `/tutors/[code]` profile and the tutor dashboard.
- **Explicit session-format choice on the tutor's course form.** A course
  offering's per-format prices (`price_one_on_one` / `price_group`, 0031) used
  to mean "leave the price blank = not offered", which was easy to miss. The
  tutor's course form now asks **how the course is offered — One-on-one /
  Group / Both** — up front and renders only the matching price field(s); the
  unoffered format is stored NULL so the request dialog greys it out with
  "Not offered for this course." (the student-side wiring from 0031 already
  did that). Re-adding a course with a format left out removes that format from
  the offer.
- **Student dashboard: requests first.** The student dashboard now leads with
  **My tutor requests** (it carries the paywall and "pay now"), then the
  payment ground-rules note, then "Courses for your program", then the money
  view. `StudentRequestsCard` gained `hideWhenEmpty` so a student with no
  requests lands on their courses instead of an explanatory placeholder.
- **Resend send-failure honesty.** `deliver()` now reads the SDK result
  instead of assuming success: resend-node v6 RESOLVES on an API error with
  `{ data: null, error }` (it does not throw), so the old code returned null
  for every rejection and `/forgot-password` claimed a code had been emailed
  when it had not. The error is logged raw and mapped by `lib/email/errors.ts`
  (`emailErrorReason`, unit-tested) because Resend's own wording names the
  account owner's address. `onboarding@resend.dev` only reaches that owner's
  inbox — a verified domain (`EMAIL_FROM`) is what turns student email on.

---

## 3. Architecture

```
src/
├─ app/                  → App Router: marketing, (app) dashboards, (auth) pages
│  └─ (app)/             → dashboard/ (all roles), tutor/, admin/ (role-gated)
├─ services/             ← ALL business logic. UI never queries Supabase directly.
│  ├─ auth/              → sign-up/sign-in/sign-out actions, getCurrentProfile,
│  │                        requireProfile / requireRole guards
│  ├─ tutors/            → approved-tutor listings (cached), onboarding forms,
│  │                        per-format pricing (pricing.ts, pure + tested)
│  ├─ courses/           → taxonomy + search (cached), tutor-added course
│  │                        approval queue, course library assets
│  ├─ requests/          → tutor requests + the paywall, session format
│  ├─ payments/          → engagements, installments, part payments, plans
│  │                        and single-use payment links, Paystack webhook
│  ├─ library/           → the static Drive tree, indexed by course code
│  ├─ sessions/          → tutoring timetable: schedule, confirm attendance
│  │                        (dual ticks), cancel (soft)
│  ├─ chat/              → /chat page: conversation list (names + last-message
│  │                        preview), thread, composer; polling refresh
│  ├─ admin/             → approval workflow (RPCs) + audit log
│  └─ moderation/        → reports & blocks
├─ lib/                  → supabase admin client + middleware helper, auth
│  │                        primitives (password, session, throttle,
│  │                        redirect), email/ (Resend), sms (Arkesel), money,
│  │                        time formatting (Accra), cn()
├─ components/           → ui/ primitives (Card, Button, Badge, Field(s),
│  │                        Container, BentoBackdrop, AnimatedGradient),
│  │                        navigation/ (FloatingNav, MobileTabBar), auth/,
│  │                        tutor/, sessions/, chat/, admin/, support/
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
| `0011`–`0023` | Payments (engagements/installments/payments/payouts), tutor requests + public codes, moderation reports, tutor-profile repair, payout transfers + reconciliation, course library, asset semesters, student program, course year tier, session format, student phone, study groups — each described in the history above |
| `0024_request_session_mode.sql` | `tutor_requests.session_mode` (per request, not per profile); `send_tutor_request` gains `p_session_mode`; `update_tutor_request_session` for a pending request. `profiles.session_mode` is legacy and no longer read |
| `0025_page_views.sql` | First-party traffic log (`path`, `referrer_host`, `visitor_hash`, `created_at`) for the admin Performance tab — no IPs, no user agents, no query strings; deny-all RLS |
| `0026_knust_course_curriculum.sql` | `courses.code` / `credits` / `semester`; seeds the KNUST Mechanical Engineering curriculum (Level 100→400, both semesters, 41 coded courses). Generic un-coded Mechanical rows are deleted only when nothing references them |
| `0027_sms_messages.sql` | `sms_messages` — the log of every SMS attempt (`to_number`, `body`, `kind`, `sms_id`, `status`, `delivery_status`, `error`, `dedupe_key`). The UNIQUE index on `dedupe_key` is the atomic claim that stops a re-run from texting anybody twice. Plus `profiles.sms_opt_out` and `profiles.sms_verified_at`. Deny-all RLS |
| `0028_rate_per_semester.sql` | Renames `tutor_profiles.rate_per_hour` → `rate_per_semester` — prices are per semester, and the column was the last place the old hourly framing survived. The app reads and writes both names, so it works before and after the migration is applied |
| `0029_full_upfront_admin_payments.sql` | 100% upfront: engagements are created with ONE installment for the full semester fee (the idx check is relaxed to 1..12); `installments.paid_amount` tracks partial coverage; `payment_apply_verified_payment` accepts partial amounts and flips the installment to paid only when fully covered; new admin RPC `admin_record_part_payment` records money collected out-of-band (cash/personal MoMo to the admin) with a synthetic `ADMIN-…` reference, applying it to the agreement and activating it immediately (recording one IS approving the plan). `request_payout` is unchanged — it already requires every installment settled |
| `0030_knust_mech_department_curriculum.sql` | Rebuilds the catalog from the department's OWN published structures (mech.knust.edu.gh HTML tables + the Marine/Automobile brochure PDFs): real codes/credits/semesters for Mechanical, Industrial, Marine and Automobile Engineering (Levels 100→400, incl. the Year-4 specialisation options). Replaces 0026's invented pairings (stale unreferenced rows are deleted); shared courses are seeded per programme; site-inconsistent duplicate codes (IE 356, AME 481, AME 496) keep one coded row + one NULL-coded row. Aerospace is listed by the department but publishes no structure — deliberately not seeded |
| `0031_tutor_pricing_and_course_approval.sql` | `tutor_services.price_group` + `price_one_on_one` (both nullable = format not offered), backfilled from `price` so live group requests stay payable; a check keeps at least one usable price. `courses.is_approved` (default TRUE; seeded rows stay public) + `created_by_profile_id` for tutor-added courses, which are created FALSE and hidden until an admin approves; a case-insensitive unique index on `(subject, code)` dedupes a tutor adding a course that already exists |
| `0032_payment_plans_and_links.sql` | `engagements.expected_full_payment_at` (the promised date the balance is settled). `payment_requests` — admin-issued, single-use part-payment links: SHA-256-hashed token, amount in pesewas, `open`/`paid`/`cancelled`, expiry, deny-all RLS. `payments.payment_request_id` ties the Paystack charge to its link so the webhook can mark it paid in the same transaction. `payment_apply_verified_payment` still re-checks the amount under a lock |
| `0033_knust_mech_brochure_corrections.sql` | The department's brochure is authoritative: adds `EE 252 Electrical Engineering Machines` (Y3S2, 2 cr) and `ME 496 Human Factors and Ergonomics` (Y4S2, 3 cr) — the two courses 0030 dropped because their codes were duplicated in the printed tables |
| `0034_payment_fee_passthrough.sql` | `payments.fee_amount` — the Paystack processing fee (pesewas) the student paid ON TOP of `amount`; the charge is `amount + fee_amount`, while `amount` stays the money applied to the installment. Also fixes `payment_apply_verified_payment`'s idempotency guard: it returned early for ANY row with the reference, so the `initialized` row written at checkout made the function mark the payment paid without ever crediting the installment. It now short-circuits only an already-`paid` row |

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
  purple vs deep-navy glows; `variant="grid"` adds the `PerspectiveGrid`
  horizon, `variant="smooth"` is the glows alone). It is an
  absolutely-positioned sibling, so content that must sit on top either wraps
  in a `relative` element or the backdrop takes `-z-10`. If the wrapper is
  **opaque** it also needs `isolate` — see the gotcha below. Hero surfaces use
  `AnimatedGradient`; the landing hero is a static gradient with
  `FloatingLines` (WebGL) on top; all app chrome uses `FloatingNav`.
- **Animated decoration has a budget.** `BeamCard` beams are `mode="hover"`
  everywhere — an *active* beam repaints every frame, and four of them cost
  ~15 fps of scroll on the project's reference GPU. `FloatingLines` documents
  its own render contract at the top of the file; treat its line count, pixel
  ratio and fps cap as load-bearing. Anything that would animate continuously
  on the landing page needs the scroll benchmark before it ships — see the
  history entry above.
- **Errors:** never expose raw DB errors to users beyond `error.message` in
  form states.
- **Prices are PER SEMESTER.** Every price tag in the app reads
  `GH₵<amount>/semester` — the per-course quote (what the student actually
  pays) and the engagement totals. **Never "/hr"
  or "per hour".** The rate column was renamed `rate_per_hour` →
  `rate_per_semester` in 0028; the app still reads and writes BOTH names so it
  can be deployed before that migration is applied (`readRate` in
  `services/tutors/rate.ts`, and the write fallback in
  `services/tutors/mutations.ts`). That profile-wide rate is now **legacy** —
  the tutor dashboard no longer asks for one (each course carries its own
  one-on-one and group price), so it is only a fallback for pre-0031 rows; the
  public "From GH₵…" headline comes from the cheapest offering. **And it's 100% UPFRONT (0029):** a
  student pays the full semester fee at the paywall; there is no 50/50 split
  anywhere in the product. A student who can't pay in full reaches the admin
  team — WhatsApp first (`adminWhatsappUrl`), or the in-site payment-plan
  chat — and the admin records each out-of-band part payment against the
  agreement (`admin_record_part_payment` / `RecordPartPaymentForm`), where it
  feeds earnings, payouts and analytics like any Paystack charge. A student
  who can't pay even that asks for a plan; the admin sets a **promised date**
  (`expected_full_payment_at`, 0032) and sends a **single-use part-payment
  link** (`payment_requests`, SHA-256 hashed at rest) for an amount the admin
  approved.
- **Prices are PER FORMAT (0031).** A `tutor_services` row carries
  `price_one_on_one` and `price_group` (the group price is **per student**);
  either may be NULL = "not offered in that format". Never fall back to the
  other format's price for a request — the request UI disables the missing
  format and the paywall raises `format_not_offered`. Render prices through
  `components/tutors/ServicePrice` (`priceTag`, `servicePriceSummary`,
  `hasDistinctFormatPrices`) so the card, profile page and tutor dashboard
  agree; a pre-0031 row shows one `/semester` price, not the same number
  twice. Read amounts with `servicePrice()`/`formatPrices()` in
  `services/tutors/pricing.ts` — they tolerate the legacy `price` column.
- **Paystack's fee is the student's (0034).** `checkoutTotal(net)` in
  `services/payments/fees.ts` grosses up: the charge is `net + fee`, the
  agreement gets exactly `net`. Never charge the net and hope the fee comes out
  of Harcourt's margin. The fee is computed server-side at checkout, stored on
  `payments.fee_amount`, and the webhook verifies `verified === amount + fee`
  from **that row** (not from current config), then passes the **net** to
  `payment_apply_verified_payment`. Display the total the student will actually
  pay (`chargePesewas` / `checkout.totalPesewas`), and show the fee line
  separately. Read the rate through `paystackFeeConfig()`; the defaults are
  Paystack Ghana's published 1.95%, no flat fee, no cap.

---

## 6. Environment & setup

`.env.local` (gitignored; template in `.env.example`):
```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # REQUIRED — everything runs through this.
                             # There is no anon key: the browser never touches
                             # the DB, so don't add NEXT_PUBLIC_SUPABASE_ANON_KEY.
NEXT_PUBLIC_ADMIN_WHATSAPP=   # student Contact-admin WhatsApp button (digits only, e.g. 233201234567)
RESEND_API_KEY=               # optional — email notifications (Resend, free tier)
EMAIL_FROM=                   # optional — verified-domain sender, e.g. "Harcourt <noreply@yourdomain.com>"
APP_URL=                      # optional — public origin for email links (default http://localhost:3000)
ANALYTICS_SALT=               # optional — extra salt for the page-view visitor hash (0025)
PAYSTACK_SECRET_KEY=          # Paystack secret (sk_test_… / sk_live_…) — server only
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=  # only if a client-side Paystack popup is added
PAYSTACK_FEE_PASSTHROUGH=1    # 0034 — charge Paystack's fee to the student (0 = absorb it)
PAYSTACK_FEE_PERCENT=1.95     # Ghana schedule; override if Paystack changes pricing
PAYSTACK_FEE_FIXED_PESEWAS=0  # flat component (Ghana 0; Nigeria 10000 = NGN 100)
PAYSTACK_FEE_CAP_PESEWAS=     # optional cap on the fee passed to the student
SMS_PROVIDER=arkesel          # sms provider: arkesel (default) | mnotify | hubtel
SMS_API_KEY=                  # provider API key (server only) — falls back to ARKESEL_API_KEY
SMS_SENDER_ID=                # sender on the handset (≤11 chars) — must be approved in Ghana
SMS_SANDBOX=1                 # 1 = not billed, not delivered (build); 0 = live texts
SMS_DAILY_CAP=                # max texts per day (default 200)
SMS_PER_NUMBER_CAP=           # max texts to one number per day (default 10)
SMS_MIN_BALANCE=              # stop sending below this credit balance (default 50)
```

Paystack dashboard configuration: webhook `https://<APP_URL host>/api/payments/webhook`
with events `charge.success`, `transfer.success`, `transfer.failed`,
`transfer.reversed`; hosted checkout returns to `/dashboard?payment=return`.
Set the same env vars in the Vercel project (`.env.local` is local only).

Arkesel needs no dashboard configuration: the app passes
`<APP_URL>/api/sms/delivery` as the `callback_url` on every send and Arkesel
calls it back with `?sms_id=&status=`. The "Harcourt" sender ID must be
registered and approved in the Arkesel account first (unapproved → 403 on
every send).

Setup runbook:
1. `npm install`
2. Apply migrations `0001` → `0033` in the Supabase SQL Editor, in order
   (each is safe to re-run)
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
- **`PerspectiveGrid` geometry is load-bearing.** `perspective(500px)
  rotateX(60deg) translateY(-100px) scale(2)` drives the plane through the
  perspective camera at ~338px of element height (`2y - 100 = 500 / sin60`);
  past that the projection inverts and the lines smear. So the band stays
  420–520px tall and its mask uses **px** stops that reach zero at 310px,
  before that limit. Do not stretch the plane to cover a taller region, and do
  not convert the mask to percentages — the visible depth would shift at every
  breakpoint.
- **An opaque sheet needs `isolate` for `-z-10` children.** A negative
  z-index layer paints behind an ancestor's background unless that ancestor is
  itself a stacking context. The rounded sheets (landing marquee, `/tutors`
  directory) are opaque `bg-canvas` and host both the `BentoBackdrop` and a
  `PerspectiveGrid`, so they carry `isolate`; drop it and both layers silently
  disappear behind the sheet.
- **Tailwind can't see runtime-interpolated class names.** Building a class
  with a template literal (`[background:radial-gradient(${color})]`, `bg-${x}`)
  produces NO CSS — the scanner only reads literal strings in the source.
  Dynamic values must go through an inline `style` prop; only keep static
  literal utilities as classes. See `AnimatedGradient` for the pattern.
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
- ~~Email notifications~~ ✅ (Resend — messages, sessions, admin review,
  password-reset codes; `src/lib/email/`, `after()`-based, no-op without a key).
- ~~Session reminders~~ ✅ (email + SMS — `.github/workflows/reminders.yml`
  fires `/api/sessions/remind` every 15 min; both parties get a text 45–90
  minutes before the session, deduped so a re-run never double-texts).
- Phone-ownership verification (Arkesel OTP) so an unproven number can't
  carry a password-reset code — `profiles.sms_verified_at` is already there
  waiting for it.
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
