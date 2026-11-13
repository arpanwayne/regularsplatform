/**
 * Which WhatsApp number a location sends from (pure, no Prisma).
 *
 *  1. The location's own WhatsApp Business number, when it has connected one
 *     (Settings → Phone number ID + access token).
 *  2. Otherwise, for businesses in a "shared" country (India by default),
 *     the platform's shared number — the Loopdesk AI number, +91 90414 36801.
 *     Every Indian client without its own Meta setup sends from it; each
 *     template names the business, so customers know who is writing.
 *  3. Otherwise none — the caller falls back to SMS.
 *
 * Env for the shared number:
 *   WHATSAPP_SHARED_PHONE_NUMBER_ID   Meta phone number ID of +91 90414 36801
 *   WHATSAPP_SHARED_ACCESS_TOKEN      system-user permanent token
 *   WHATSAPP_SHARED_WABA_ID           WhatsApp Business Account ID (templates live here)
 *   WHATSAPP_SHARED_DISPLAY_NUMBER    shown in Settings, default "+91 90414 36801"
 *   WHATSAPP_SHARED_COUNTRIES         comma list, default "IN"
 */

export type WaSender = { phoneNumberId: string; accessToken: string; shared: boolean };

type LocationLike = { whatsappPhoneNumberId: string | null; whatsappAccessToken: string | null };

export function sharedCountries() {
  return (process.env.WHATSAPP_SHARED_COUNTRIES || "IN").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
}

export function sharedSender(): WaSender | null {
  const id = process.env.WHATSAPP_SHARED_PHONE_NUMBER_ID, token = process.env.WHATSAPP_SHARED_ACCESS_TOKEN;
  return id && token ? { phoneNumberId: id, accessToken: token, shared: true } : null;
}

export function sharedDisplayNumber() {
  return process.env.WHATSAPP_SHARED_DISPLAY_NUMBER || "+91 90414 36801";
}

export function usesSharedNumber(business: { country: string }) {
  return sharedCountries().includes((business.country || "").toUpperCase());
}

export function whatsappSenderFor(location: LocationLike | null | undefined, business: { country: string }): WaSender | null {
  if (location?.whatsappPhoneNumberId && location.whatsappAccessToken) {
    return { phoneNumberId: location.whatsappPhoneNumberId, accessToken: location.whatsappAccessToken, shared: false };
  }
  return usesSharedNumber(business) ? sharedSender() : null;
}

/** WhatsApp allows free text only within 24 hours of the other person's last message. */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
export function windowOpen(lastInboundAt: Date | null | undefined, now = new Date()) {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < SESSION_WINDOW_MS - 60_000; // 1 min safety margin
}
