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

/**
 * A Meta phone number ID is all digits. Anything else (a login email the
 * browser autofilled into Settings, bug 2 of 27 Nov 2026) is not a number
 * of our own, so it must never be used to send.
 */
export const isMetaPhoneNumberId = (v: string | null | undefined) => /^\d{1,25}$/.test(String(v ?? "").trim());

/** The location really has its own WhatsApp number set up. */
export function hasOwnWhatsApp(location: LocationLike | null | undefined) {
  return !!location?.whatsappAccessToken && isMetaPhoneNumberId(location.whatsappPhoneNumberId);
}

export function whatsappSenderFor(location: LocationLike | null | undefined, business: { country: string }): WaSender | null {
  if (location && hasOwnWhatsApp(location) && location.whatsappPhoneNumberId && location.whatsappAccessToken) {
    return { phoneNumberId: location.whatsappPhoneNumberId, accessToken: location.whatsappAccessToken, shared: false };
  }
  return usesSharedNumber(business) ? sharedSender() : null;
}

/** WhatsApp allows free text only within 24 hours of the other person's last message. */
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
export function windowOpen(lastInboundAt: Date | null | undefined, now = new Date()) {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < SESSION_WINDOW_MS - 60_000; // 1 min safety margin
}

/**
 * Plain-words reason for a WhatsApp (Meta) error code, shown in the inbox
 * next to a message that wasn't delivered. Unknown codes fall back to
 * Meta's own title.
 */
const WA_ERROR_TEXT: Record<number, string> = {
  131049: "WhatsApp held this back: Meta limits how many marketing messages one person gets from businesses. Try again tomorrow, or wait until they message you.",
  131050: "This person has turned off marketing messages from businesses on WhatsApp.",
  131047: "More than 24 hours since their last message, so only an approved template can be sent.",
  131026: "This number can't receive WhatsApp messages (not on WhatsApp, or an old app version).",
  131048: "WhatsApp is limiting this number for sending too many messages too fast. Slow down and retry later.",
  131056: "Too many messages to this one person in a short time. Retry in a few minutes.",
  131051: "Message type not supported.",
  132000: "Template values don't match the approved template (wrong number of variables).",
  132001: "This template isn't approved in this language yet (check Admin → WhatsApp templates).",
  132015: "This template is paused by Meta because of low quality.",
  132016: "This template is disabled by Meta.",
  131042: "Payment problem on the WhatsApp Business account.",
  368: "WhatsApp has temporarily blocked this number for policy reasons.",
};

export function waErrorText(code: number | null | undefined, title?: string | null) {
  if (code != null && WA_ERROR_TEXT[code]) return `${WA_ERROR_TEXT[code]} (Meta ${code})`;
  if (title) return code != null ? `${title} (Meta ${code})` : title;
  return code != null ? `Not delivered (Meta ${code})` : "Not delivered";
}

/** Reason stored on a failed WhatsApp Message (rawPayload JSON), for the inbox. */
export function failureReason(rawPayload: string | null | undefined): string | null {
  if (!rawPayload) return null;
  try {
    const p = JSON.parse(rawPayload) as { deliveryError?: { code?: number; title?: string }; error?: string | null; errorCode?: number | null };
    if (p.deliveryError) return waErrorText(p.deliveryError.code, p.deliveryError.title);
    if (p.errorCode != null || p.error) return waErrorText(p.errorCode, p.error);
  } catch { /* not JSON */ }
  return null;
}
