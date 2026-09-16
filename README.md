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

- **Businesses** — every registered business, its owner, WhatsApp connection status, customer
  count; suspend/reactivate a business (stops its webhook ingestion and blocks its calling
  scripts immediately — see `app/api/webhook/whatsapp/route.ts` and the calling-script routes);
  change its plan label (`STARTER`/`GROWTH`/`PRO`, manual only — no billing integration); override
  its segmentation thresholds (at-risk/dormant days, established-visit-count) without touching
  code, falling back to the platform defaults in `lib/segmentation.ts` when unset.
- **Owners** — every business owner; reset a lost password (generates a one-time temporary
  password since there's no email-based "forgot password" flow yet — the admin has to relay it
  out-of-band).
- **Overview** — platform-wide counts: total/active/suspended businesses, WhatsApp-connected
  businesses, total customers, segment breakdown, and calling-script trigger counts, all
  aggregated across every business.

Not built yet (see roadmap): per-business billing/payment status beyond the manual plan label,
API cost/usage metering (Anthropic spend, voice-provider minutes) per business, and a structured
error/failed-webhook log viewer — right now troubleshooting a business's WhatsApp connection
means checking its `whatsappPhoneNumberId` in the Businesses list and its `CallLog` rows.

### Connecting a real WhatsApp Business number

1. Create a Meta App with the WhatsApp product, get a phone number ID + access token.
2. In the dashboard → **Settings**, save the phone number ID and access token.
3. In the Meta App dashboard, set the webhook callback URL and verify token to the values shown
   on that same Settings page, and subscribe to the `messages` field.
4. Customer messages will now start appearing under **Customers**, segmented automatically.

### Environment variables

See [`.env.example`](./.env.example). `ANTHROPIC_API_KEY` and the `CALLING_PROVIDER_*` vars are
optional — the platform works fully without them, just with static (non-AI-personalized)
scripts and calls logged as `PENDING` instead of actually dialed.

## What's intentionally an MVP boundary

- **Voice calling**: no telephony/voice-AI vendor is wired in (`lib/calling-provider.ts` is the
  integration seam — Bland AI, Vapi, Exotel, Knowlarity are common choices). Without a
  configured provider, "triggering" a call just logs it — this is honest by design rather than
  faking a phone call that never happens.
- **WhatsApp Business API compliance**: automated opt-out handling is implemented (see
  [`COMPLIANCE.md`](./COMPLIANCE.md)), but several items in that doc still need a manual review
  against your actual Meta Business Manager setup before going live with real customers.

## Roadmap (from the project notes)

- [ ] **Pilot client** — run this against one real salon/clinic/gym. This is the one item that
  needs a real business relationship, not more code — see "Pilot readiness" below for what's
  ready and what to prep before that first call.
- [x] Document segmentation logic (this README + `lib/segmentation.ts`)
- [x] Restaurant/food business calling-script variant (`lib/calling-scripts/templates.ts` —
  clinic, salon, and restaurant now have dedicated scripts; gym/retail still use the generic one)
- [x] Analytics dashboard (overview + customers + calling scripts pages)
- [x] Pricing/packaging tiers — drafted in [`PRICING.md`](./PRICING.md) and shown on the landing
  page (`lib/pricing.ts`); numbers are a starting proposal, not finalized (see that doc for why)
- [x] WhatsApp Business API compliance review — [`COMPLIANCE.md`](./COMPLIANCE.md) documents
  what's enforced in code (opt-out handling) vs. what needs manual verification against your
  Meta setup before launch

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
  api/            route handlers (auth, webhook, segmentation, calling scripts, business, admin)
  dashboard/      per-business owner: overview, customers, calling-scripts, settings pages
  admin/          super admin: platform overview, businesses, owners
  login/ signup/  auth pages
lib/
  segmentation.ts       rule-based behavioral segmentation
  run-segmentation.ts   recompute + persist segments for a business (applies admin overrides)
  whatsapp.ts            webhook payload parsing + message classification + opt-out detection
  calling-scripts/      Hinglish templates + generation (+ optional Claude personalization)
  calling-provider.ts   voice-call trigger seam (no vendor wired by default)
  auth.ts / session.ts  JWT cookie auth
  admin.ts               requireSuperAdmin() guard for admin routes
  pricing.ts             draft pricing tiers shown on the landing page
prisma/
  schema.prisma         data model
  promote-admin.ts      CLI script to grant SUPER_ADMIN to an existing user
COMPLIANCE.md           WhatsApp Business Policy checklist (what's enforced vs. manual review)
PRICING.md              pricing tier reasoning + open questions
```
