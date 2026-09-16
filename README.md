# Regulars — Platform

WhatsApp-native loyalty and retention platform for multi-sector SMBs (salons, gyms, clinics,
retail) — not restaurant-only. Solves the same problem traditional punch-card/app loyalty
programs never could for small businesses: zero manual effort, on a channel customers already
use every day.

This repo is the **product platform** (backend + dashboard) — separate from
[`arpanwayne/regulars`](https://github.com/arpanwayne/regulars), which is the marketing website.

## How it works

1. **Passive data capture** — the business's transactional WhatsApp messages (booking
   confirmations, order updates, appointment reminders) flow through a WhatsApp Cloud API
   webhook and silently build each customer's profile. No manual entry by the business owner.
2. **Behavioral segmentation** — every customer is scored into `NEW`, `REGULAR`, `AT_RISK`,
   `HIGH_SPENDER`, or `DORMANT` based on visit recency, frequency, and spend. The rules are in
   [`lib/segmentation.ts`](./lib/segmentation.ts) — see below, this was previously undocumented
   per the project notes.
3. **AI calling scripts** — Hinglish call scripts, tailored per sector (clinic, salon, and
   restaurant variants ship today; gym/retail use a generic fallback) and per segment, ready to
   trigger re-engagement. Optionally personalized per-customer via Claude when
   `ANTHROPIC_API_KEY` is set; falls back to the static template otherwise.

## Segmentation logic (documented, as flagged in the project notes)

| Segment | Rule |
|---|---|
| `DORMANT` | No visit in > 60 days |
| `HIGH_SPENDER` | Total spend at/above the business's own p80 spend (needs ≥5 customers with spend data to compute) |
| `AT_RISK` | ≥3 lifetime visits, but 30–60 days since last visit |
| `REGULAR` | ≥3 lifetime visits, seen within the last 30 days |
| `NEW` | Everyone else (new or low-frequency, recently seen) |

Thresholds are constants in `lib/segmentation.ts` (`DEFAULT_THRESHOLDS`) — tune them per
vertical once real pilot data comes in.

## Tech stack

- Next.js 14 (App Router, TypeScript) — matches the existing website repo's stack
- Prisma + SQLite by default (swap `DATABASE_URL` for Postgres in production)
- Cookie-based JWT auth (no third-party auth vendor needed for MVP)
- Tailwind CSS

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in SESSION_SECRET at minimum
npm run db:push              # creates the SQLite schema
npm run db:seed              # optional: demo salon + clinic with sample customers
npm run dev
```

Demo logins after seeding: `owner@glow-salon.demo` / `owner@wellness-clinic.demo`, password
`password123`. A demo super admin is also seeded: `admin@regulars.demo` / `password123` → `/admin`.

### Super admin panel

A `SUPER_ADMIN` role manages the platform across every business (not tied to one business like a
regular owner login). It's not self-service signup — grant it to an existing user with:

```bash
npm run admin:promote -- someone@example.com
```

Then log in as that user and go to `/admin`. What's there today:

- **Businesses** — every registered business, its owner, how many of its locations have
  WhatsApp connected, customer count; suspend/reactivate a business (stops every one of its
  locations from ingesting WhatsApp and blocks its calling scripts immediately — see
  `app/api/webhook/whatsapp/route.ts` and the calling-script routes); change its plan label
  (`STARTER`/`GROWTH`/`PRO` — set automatically on a verified payment, or manually here); override
  its segmentation thresholds (at-risk/dormant days, established-visit-count) without touching
  code, falling back to the platform defaults in `lib/segmentation.ts` when unset.
- **Owners** — every business owner; reset a lost password (generates a one-time temporary
  password — owners also have their own self-service "forgot password" flow now, see below; this
  admin-reset is the fallback when that isn't reachable either).
- **Usage** — AI script personalization calls and their estimated Claude cost, and voice-call
  trigger counts, per business (`lib/usage.ts` — estimates only, not billing-grade).
- **Logs** — the last 100 `SystemLog` entries (webhook failures, calling-script/voice-call
  errors, billing failures), filterable by level (`lib/logger.ts`). ERROR-level entries are also
  forwarded to `ALERT_WEBHOOK_URL` when set (a Slack incoming webhook or any JSON endpoint) —
  see "Alerting" below.
- **Compliance** — automated self-check (`lib/compliance-check.ts`): is webhook signature
  verification on, is any location misconfigured, and an integrity check that no calling script
  was ever generated for an opted-out customer. This is a stand-in for the parts of the WhatsApp
  compliance review that code *can* verify — see "WhatsApp compliance self-check" below for what
  it can't.
- **Overview** — platform-wide counts: total/active/suspended businesses, WhatsApp-connected
  locations, total customers, segment breakdown, calling-script trigger counts, and total paid
  revenue, all aggregated across every business.

### Multi-location businesses

A `Business` can have multiple `Location`s (e.g. a salon chain's branches) — each Location
connects its **own** WhatsApp Business number independently, and customers/messages/visits
belong to the location whose number they messaged. A single-outlet signup gets one Location
auto-created with the business's own name, so the common case needs no extra step; add more from
**Settings**. The same phone number messaging two locations of one chain still creates two
separate `Customer` rows (each location keeps its own segmentation/calling-script targeting) —
but **Dashboard → Customers → "View unified across locations"** (shown once a business has more
than one location) rolls those rows up by phone number into one read-only combined view: total
visits/spend across every branch, which locations they've visited, and a unified segment
computed from the combined stats. Nothing is merged in the database; it's purely additive.

### WhatsApp compliance self-check

`/admin/compliance` runs the checks in `lib/compliance-check.ts` — PASS/WARN/FAIL per business
for everything this codebase actually controls (signature verification, misconfigured locations,
opt-out integrity). It is explicitly **not** a substitute for a human reviewing your live Meta
Business Manager setup against the items `COMPLIANCE.md` lists as needing manual review (opt-in
policy, the 24-hour messaging window, template category approval) — those live on Meta's side,
not in this database, so no amount of code here can verify them for you.

### Alerting

Set `ALERT_WEBHOOK_URL` (a Slack incoming webhook URL, or any endpoint that accepts JSON) to get
real-time notifications for ERROR-level `SystemLog` entries — otherwise they only surface to
someone who checks `/admin/logs`. This is deliberately lightweight (error alerting only, no
traces or performance monitoring) rather than a full APM integration like Sentry/Datadog, which
would be the next step for real production observability.

### Self-service password reset

**Settings → (login page) → Forgot password?** sends a 1-hour reset link. It only actually
*emails* that link if `EMAIL_PROVIDER_API_KEY`/`EMAIL_FROM_ADDRESS` (Resend) are configured
(`lib/email.ts`) — without them, the link is written to `SystemLog` (`/admin/logs`, level WARN)
instead of silently failing, so a super admin can still retrieve and relay it. The response to
the forgot-password request is always the same generic message either way, so the endpoint can't
be used to check which emails are registered.

### Billing

**Dashboard → Billing** lets an owner pay for a plan upgrade via Razorpay (`lib/billing.ts`):
create an order, Razorpay Checkout collects payment, the backend verifies the HMAC signature
before marking it paid and updating `Business.plan` (never trusts the client-side success
callback alone). Needs `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` — without them the page still
shows the plans but "Upgrade" explains payments aren't configured instead of opening a fake
checkout. This is one-time period payments (30 days per purchase) — there's no saved payment
method or UPI Autopay mandate, so nothing ever *auto-charges*. What it does do: `getCurrentBusiness()`
lazily checks on every request whether a paid plan's `planExpiresAt` has passed and, if so,
downgrades it back to `STARTER` (`lib/billing.ts`, `downgradeIfExpired`) — so a lapsed plan never
silently keeps paid perks. For businesses nobody happens to load that day, `POST /api/cron/downgrade-expired-plans`
(protected by `CRON_SECRET`, wired to run daily via `vercel.json` if deployed on Vercel) sweeps
the rest. The Billing page shows a renewal reminder banner starting 3 days before expiry.

### Connecting a real WhatsApp Business number

1. Create a Meta App with the WhatsApp product, get a phone number ID + access token.
2. In the dashboard → **Settings**, find the location you want to connect (or add a new one) and
   save its phone number ID and access token.
3. In the Meta App dashboard, set the webhook callback URL and verify token to the values shown
   on that same location's card, and subscribe to the `messages` field.
4. Customer messages will now start appearing under **Customers**, segmented automatically.

### Environment variables

See [`.env.example`](./.env.example). Everything except `DATABASE_URL` and `SESSION_SECRET` is
optional — the platform works fully without any of it, degrading honestly instead of faking
success: static (non-AI-personalized) scripts without `ANTHROPIC_API_KEY`, calls logged as
`PENDING` without a `CALLING_PROVIDER_*`, reset links logged instead of emailed without
`EMAIL_PROVIDER_API_KEY`, and a "payments not configured" message instead of checkout without
`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`.

## What's intentionally an MVP boundary

- **Voice calling**: no telephony/voice-AI vendor is wired in (`lib/calling-provider.ts` is the
  integration seam — Bland AI, Vapi, Exotel, Knowlarity are common choices). Without a
  configured provider, "triggering" a call just logs it — this is honest by design rather than
  faking a phone call that never happens. Usage tracking (`/admin/usage`) counts trigger
  *attempts*, not billed minutes, since no provider reports call duration back yet.
- **Billing**: one-time period payments via Razorpay with auto-downgrade on expiry, not a
  recurring subscription engine with auto-charge — see "Billing" above.
- **WhatsApp Business API compliance**: automated opt-out handling plus an automated self-check
  (`/admin/compliance`) cover everything code can verify (see [`COMPLIANCE.md`](./COMPLIANCE.md)),
  but the items that live on Meta's side of your account still need a human to review them there.
- **Multi-location**: one location = one WhatsApp number = its own `Customer` rows; there's now a
  read-only unified cross-location view (see "Multi-location businesses" above), but the
  underlying records still aren't merged.
- **Observability**: `/admin/logs` plus optional Slack/webhook alerting on errors (see
  "Alerting" above) — not a full APM (no traces, no performance monitoring).

## Roadmap (from the project notes)

- [ ] **Pilot client** — run this against one real salon/clinic/gym. This is the one item that
  needs a real business relationship, not more code — see "Pilot readiness" below for what's
  ready and what to prep before that first call.
- [x] Document segmentation logic (this README + `lib/segmentation.ts`)
- [x] Restaurant/food business calling-script variant (`lib/calling-scripts/templates.ts` —
  clinic, salon, and restaurant now have dedicated scripts; gym/retail still use the generic one)
- [x] Analytics dashboard (overview + customers + calling scripts pages)
- [x] Pricing/packaging tiers — drafted in [`PRICING.md`](./PRICING.md), shown on the landing
  page and billable via Razorpay from the dashboard; numbers are a starting proposal, not
  finalized (see that doc for why)
- [x] WhatsApp Business API compliance review — [`COMPLIANCE.md`](./COMPLIANCE.md) documents
  what's enforced in code (opt-out handling) vs. what needs manual verification against your
  Meta setup before launch
- [x] Billing/payment integration (Razorpay, one-time period payments + auto-downgrade on expiry)
- [x] API usage/cost tracking (`/admin/usage`)
- [x] System error/log viewer (`/admin/logs`) + optional Slack/webhook alerting
- [x] Self-service "forgot password" for owners
- [x] Multi-location support (each location connects its own WhatsApp number) + a read-only
  cross-location unified customer view
- [x] Automated WhatsApp compliance self-check (`/admin/compliance`) — covers what code can
  verify; the Meta-side review in `COMPLIANCE.md` still needs a human

### Pilot readiness

What's already in place for a real pilot:

- Opt-out handling is live (see Compliance section above) — required before contacting real
  customers.
- Segmentation thresholds (`DEFAULT_THRESHOLDS` in `lib/segmentation.ts`) are a reasonable
  starting point but *will* need tuning once real visit-frequency data comes in — that tuning is
  the actual point of running a pilot.
- Sector scripts exist for clinic, salon, and restaurant; gym/retail get the generic fallback,
  fine for a first pilot.

What you need to bring to start one:

1. A real salon/clinic/gym willing to connect their WhatsApp Business number (see "Connecting a
   real WhatsApp Business number" above) — ideally a business already used to some WhatsApp
   traffic with customers, so passive capture has something to work with quickly.
2. A read of `COMPLIANCE.md`'s "needs manual review" section against that business's actual
   Meta Business Manager setup, before turning on automated outreach.
3. A decision on whether the pilot runs free/discounted in exchange for feedback (see
   `PRICING.md`, open question 3) — recommended, since neither the segmentation thresholds nor
   the pricing tiers are validated against real usage yet.

## Project structure

```
app/
  api/            route handlers (auth, webhook, segmentation, calling scripts, business,
                   locations, billing, admin)
  dashboard/      per-business owner: overview, customers (+ unified view), calling-scripts,
                   billing, settings
  admin/          super admin: platform overview, businesses, owners, usage, logs, compliance
  login/ signup/ forgot-password/ reset-password/   auth pages
lib/
  segmentation.ts       rule-based behavioral segmentation
  run-segmentation.ts   recompute + persist segments for a business (applies admin overrides)
  whatsapp.ts            webhook payload parsing + message classification + opt-out detection
  calling-scripts/      Hinglish templates + generation (+ optional Claude personalization)
  calling-provider.ts   voice-call trigger seam (no vendor wired by default)
  billing.ts             Razorpay order creation, signature verification, auto-downgrade
  compliance-check.ts    automated checks backing /admin/compliance
  email.ts               email-sending seam (Resend) for password-reset links
  usage.ts                records AI/voice usage events + estimated Claude cost
  logger.ts               writes to SystemLog (+ optional webhook alerting), read by /admin/logs
  auth.ts / session.ts / reset-token.ts   JWT cookie auth + password-reset tokens
  admin.ts               requireSuperAdmin() guard for admin routes
  pricing.ts             draft pricing tiers shown on the landing page
prisma/
  schema.prisma         data model (Business → Location[] → Customer/Message/Visit)
  promote-admin.ts      CLI script to grant SUPER_ADMIN to an existing user
vercel.json             daily cron config for the plan-downgrade sweep
COMPLIANCE.md           WhatsApp Business Policy checklist (what's enforced vs. manual review)
PRICING.md              pricing tier reasoning + open questions
```
