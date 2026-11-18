// Who may get marketing (offers, win-backs, service-due reminders, review asks).
//
// 1. Consent status (onboarding flow, Nov 2026 — see Customer.consentStatus):
//    customers added by staff or imported start PENDING and get a YES/NO
//    request; nothing marketing goes to PENDING or DECLINED.
// 2. Canada's anti-spam law (CASL): a past purchase gives implied consent for
//    two years. For IMPLIED customers in Canada, marketing stops two years
//    after their last dealing with the business. Express consent (GRANTED:
//    scanned the QR or answered YES) has no such limit.
// This is a safeguard, not legal advice. See COMPLIANCE.md.
const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000;

export type ConsentStatus = "IMPLIED" | "PENDING" | "GRANTED" | "DECLINED";
export const NO_MARKETING: ConsentStatus[] = ["PENDING", "DECLINED"];

/** Oldest last-visit date an IMPLIED customer may be marketed to (Canada only), else null. */
export function caslCutoff(country: string | null | undefined, now: Date = new Date()): Date | null {
  return country === "CA" ? new Date(now.getTime() - TWO_YEARS_MS) : null;
}

/** Prisma filter for customers a marketing message may go to. Uses AND so callers can keep their own OR. */
export function marketingConsentFilter(country: string | null | undefined, now: Date = new Date()) {
  const cutoff = caslCutoff(country, now);
  const notBlocked = { consentStatus: { notIn: NO_MARKETING } };
  if (!cutoff) return { AND: [notBlocked] };
  return { AND: [notBlocked, { OR: [{ consentStatus: "GRANTED" }, { lastSeenAt: { gte: cutoff } }] }] };
}

/** Same rule for one customer already loaded. */
export function mayMarket(c: { lastSeenAt: Date; consentStatus?: string | null }, country: string | null | undefined, now: Date = new Date()) {
  const status = (c.consentStatus ?? "IMPLIED") as ConsentStatus;
  if (NO_MARKETING.includes(status)) return false;
  if (status === "GRANTED") return true;
  const cutoff = caslCutoff(country, now);
  return !cutoff || c.lastSeenAt >= cutoff;
}
