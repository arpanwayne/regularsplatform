# WhatsApp Business API Compliance

Regulars sends business-initiated outreach (Hinglish calling scripts, and eventually WhatsApp
messages themselves) triggered by customer behavior captured passively from WhatsApp. This is
exactly the kind of automated engagement Meta's WhatsApp Business Policy regulates. This doc is
a working checklist, not a legal opinion — have it reviewed before going live with real
customers, especially at scale.

## What's already enforced in code

| Requirement | How Regulars handles it |
|---|---|
| Honor opt-outs immediately | `lib/whatsapp.ts` (`isOptOutMessage`) scans every inbound message for opt-out phrases (English: "stop", "unsubscribe"; Hinglish: "band karo", "mat bhejo", etc.). A match sets `Customer.optedOut = true` in the webhook handler, permanently. |
| Never contact an opted-out customer | `POST /api/calling-scripts/generate` and `POST /api/calling-scripts/trigger` both reject (`409`) if the target customer is opted out. The dashboard customer table shows an "Opted out" badge and disables the generate button. |
| Don't fabricate outbound calls | If no voice-calling provider is configured (`CALLING_PROVIDER_API_KEY`), `CallLog.status` stays `PENDING` instead of `TRIGGERED` — no call is claimed to have happened when it didn't. |

## What still needs a manual review before launch

These depend on your actual Meta Business Manager setup and can't be verified from code alone:

- **Opt-in before first contact.** WhatsApp Business Policy requires the *customer* to have
  opted in to receive business-initiated messages (not just messaged the business once).
  Passive capture from a booking/order/appointment flow is generally accepted as implicit
  opt-in for *service* messages about that transaction — but proactive re-engagement (the
  "at-risk"/"dormant" calling scripts this platform generates) may need explicit marketing
  opt-in depending on message category. Confirm with Meta's current policy and your legal
  counsel before sending re-engagement messages via WhatsApp itself (voice calls placed by a
  separate telephony provider are a different regulatory surface — TRAI/DND rules apply there
  in India, not WhatsApp's policy).
- **24-hour customer service window.** Free-form messages to a customer are only allowed within
  24 hours of their last message. Outside that window, only pre-approved message *templates*
  can be sent. If/when this platform sends WhatsApp messages (not just voice calls) for
  re-engagement, it must use approved templates for anything outside the 24-hour window.
- **Message template approval.** Any WhatsApp template (e.g. an automated "we miss you"
  message) must be submitted to Meta for approval before use, categorized correctly (Utility /
  Marketing / Authentication) — miscategorizing marketing as utility risks account restriction.
- **Data retention & consent.** Customer phone numbers, names, and message content are stored
  (see `prisma/schema.prisma`). Make sure your business's privacy policy discloses this, and
  that you have a process to delete a customer's data on request (not yet built — see below).
- **Quality rating & rate limits.** Meta throttles/restricts numbers with poor quality ratings
  (driven by block rates and opt-outs). High-volume automated calling-script generation
  disconnected from actual customer sentiment risks tanking the WhatsApp number's rating.

## Not yet built (recommended before scaling beyond a pilot)

- A "right to be forgotten" endpoint/flow to fully delete a customer's data on request, beyond
  just the opt-out flag.
- Explicit double opt-in capture flow if you decide re-engagement messages need it.
- Audit logging of what was sent to whom and when, for policy-dispute evidence.
