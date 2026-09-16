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
3. **AI calling scripts** — Hinglish call scripts, tailored per sector (clinic and salon
   variants ship today; gym/retail use a generic fallback) and per segment, ready to trigger
   re-engagement. Optionally personalized per-customer via Claude when `ANTHROPIC_API_KEY` is
   set; falls back to the static template otherwise.

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
`password123`.

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
- **WhatsApp Business API compliance**: verify your Meta WhatsApp Business policy compliance
  before going live with automated messaging — see the roadmap below.

## Roadmap (from the project notes)

- [ ] Pilot client — run this against one real salon/clinic/gym to validate segmentation accuracy
- [x] Document segmentation logic (this README + `lib/segmentation.ts`)
- [ ] Restaurant/food business calling-script variant (only clinic + salon exist today)
- [x] Analytics dashboard (overview + customers + calling scripts pages)
- [ ] Pricing/packaging tiers
- [ ] WhatsApp Business API compliance review against Meta policy

## Project structure

```
app/
  api/            route handlers (auth, webhook, segmentation, calling scripts, business)
  dashboard/      overview, customers, calling-scripts, settings pages
  login/ signup/  auth pages
lib/
  segmentation.ts       rule-based behavioral segmentation
  run-segmentation.ts   recompute + persist segments for a business
  whatsapp.ts            webhook payload parsing + message classification
  calling-scripts/      Hinglish templates + generation (+ optional Claude personalization)
  calling-provider.ts   voice-call trigger seam (no vendor wired by default)
  auth.ts / session.ts  JWT cookie auth
prisma/schema.prisma    data model
```
