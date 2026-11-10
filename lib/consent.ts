// Canada's anti-spam law (CASL): a past purchase gives implied consent for two
// years. We hold no record of express consent, so marketing texts stop two
// years after a Canadian customer's last dealing with the business.
// This is a safeguard, not legal advice. See COMPLIANCE.md.
const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000;

/** Filter for customers a marketing message may go to. Empty outside Canada. */
export function marketingConsentFilter(country: string | null | undefined, now: Date = new Date()) {
  return country === "CA" ? { lastSeenAt: { gte: new Date(now.getTime() - TWO_YEARS_MS) } } : {};
}
