# Pricing — Draft

**Status: draft / placeholder.** These tiers and numbers are a starting proposal based on
common Indian SMB SaaS pricing patterns (per-business monthly subscription, tiered by customer
volume and feature depth) — not a finalized decision. Treat every ₹ figure below as something to
validate against a real pilot customer's willingness to pay before selling it. Update
`lib/pricing.ts` once numbers are locked in, so the landing page pricing section stays in sync.

## Why this shape

- SMBs in this segment (salons, clinics, gyms, small retail) are used to monthly subscriptions
  in the ₹500–₹5,000/month range for software (POS, booking tools), so pricing above that band
  needs a clear ROI story (e.g. "X dormant customers recovered pays for a year").
- Usage that costs *us* real money — AI-personalized script generation (Claude API calls) and
  actual voice calls (once a provider is wired in) — should scale with the plan, not be
  unlimited on every tier, or margins break as customer count grows.
- Keep it to 3 tiers. A 4th "enterprise/custom" tier can be handled as a manual sales
  conversation rather than a public price.

## Proposed tiers

| | Starter | Growth | Pro |
|---|---|---|---|
| **Price (draft)** | ₹999/month | ₹2,499/month | ₹5,999/month |
| **Customers tracked** | Up to 300 | Up to 1,500 | Unlimited |
| **WhatsApp passive capture** | ✅ | ✅ | ✅ |
| **Behavioral segmentation** | ✅ | ✅ | ✅ |
| **Calling scripts** | Static templates only | + AI-personalized (Claude) | + AI-personalized, custom scripts per business |
| **Voice calling (once a provider is connected)** | Not included | Pay-per-call passthrough | Bundled minutes + passthrough overage |
| **Locations per account** | 1 | 1 | Multiple |
| **Support** | Email | Email + WhatsApp | Priority + onboarding call |

## Open questions to resolve before finalizing

1. **Per-business or per-location?** A salon chain with 5 outlets — one Pro subscription, or 5
   Starter ones? Recommend per-location billing once multi-location support exists (it doesn't
   yet — `Business` is single-location in the current schema).
2. **Who pays for AI/voice usage overage?** Passthrough at cost, or absorbed into a slightly
   higher flat fee? Passthrough is simpler to reason about margin-wise but adds billing
   complexity (metering, invoicing).
3. **Free trial or pilot-only free tier?** Given the roadmap's "get a pilot client" step is still
   open, consider a free/discounted pilot period for the first 2-3 real customers in exchange
   for case-study rights and product feedback, rather than debuting at a public list price.
4. **Annual discount?** Common in this market (e.g. 2 months free on annual) — worth adding once
   monthly pricing is validated.

## Where this lives in the app

`app/page.tsx` (landing page) has a Pricing section reading from `lib/pricing.ts` — update the
numbers there once they're finalized; nothing else in the app enforces or meters these tiers yet
(no billing integration exists — see roadmap in README).
