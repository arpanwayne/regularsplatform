import type { Customer } from "@prisma/client";

/**
 * Instagram helpers with no server dependencies, so the browser (inbox,
 * customer table) can use them too. Server code imports lib/instagram.ts,
 * which re-exports everything here.
 */

/** Placeholder phone for someone who has only written on Instagram. */
export const IG_PHONE_PREFIX = "ig:";
export const igPhone = (igsid: string) => `${IG_PHONE_PREFIX}${igsid}`;

/** True when we have no real phone for this customer, only their Instagram. */
export function isInstagramOnly(c: Pick<Customer, "phone">): boolean {
  return c.phone.startsWith(IG_PHONE_PREFIX);
}

/** Prisma filter: leaves out Instagram-only customers (they can't be texted or called). */
export const HAS_REAL_PHONE = { NOT: { phone: { startsWith: IG_PHONE_PREFIX } } } as const;

/** How to show a customer: saved name, then @username, then +phone. */
export function customerLabel(c: Pick<Customer, "name" | "phone"> & { instagramUsername?: string | null }): string {
  if (c.name) return c.name;
  if (c.instagramUsername) return `@${c.instagramUsername}`;
  return isInstagramOnly(c) ? "Instagram user" : `+${c.phone}`;
}


// ── Booking intent ───────────────────────────────────────────────────────

/**
 * Words people use to ask for a slot, in English, Hinglish, Hindi and
 * Punjabi. Kept simple on purpose: a wrong guess only sends a helpful link,
 * and the owner still sees every message in the inbox.
 */
const BOOKING_PATTERNS: RegExp[] = [
  /\bbook(ing|ed)?\b/i,
  /\bappoint?ment\b/i, /\bappt\b/i,
  /\bslots?\b/i,
  /\bavailab(le|ility)\b/i,
  /\bschedul(e|ing)\b/i,
  /\breserv(e|ation)\b/i,
  /\bfree (today|tomorrow|on)\b/i,
  /\b(milega|milegi|mil sakta|mil sakti)\b/i,
  /\b(kab|kitne baje) (aa|aaun|aau|aa sakti|aa sakta)/i,
  /बुक|बुकिंग|अपॉइंटमेंट|अपॉइंटमेंट|स्लॉट/,
  /ਬੁੱਕ|ਬੁਕਿੰਗ|ਅਪੌਇੰਟਮੈਂਟ|ਸਲੌਟ/,
];

export function isBookingIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  return BOOKING_PATTERNS.some((re) => re.test(text));
}

/** The automatic reply with the booking link, in the business's language. */
export function bookingReply(lang: string, businessName: string, bookingUrl: string): string {
  switch (lang) {
    case "hinglish":
      return `Hi! ${businessName} se baat karne ke liye shukriya. Aap apna slot yahan book kar sakte hain: ${bookingUrl} — koi sawaal ho to yahin message karein.`;
    case "hi":
      return `नमस्ते! ${businessName} से संपर्क करने के लिए धन्यवाद। आप अपना स्लॉट यहाँ बुक कर सकते हैं: ${bookingUrl} — कोई सवाल हो तो यहीं मैसेज करें।`;
    case "pa":
      return `ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ${businessName} ਨਾਲ ਸੰਪਰਕ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। ਤੁਸੀਂ ਆਪਣਾ ਸਮਾਂ ਇੱਥੇ ਬੁੱਕ ਕਰ ਸਕਦੇ ਹੋ: ${bookingUrl} — ਕੋਈ ਸਵਾਲ ਹੋਵੇ ਤਾਂ ਇੱਥੇ ਹੀ ਮੈਸੇਜ ਕਰੋ।`;
    default:
      return `Hi! Thanks for messaging ${businessName}. You can book your slot here: ${bookingUrl} — reply here if you have any questions.`;
  }
}

// ── Webhook payload ──────────────────────────────────────────────────────

export type InstagramMessagingEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp?: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: { type?: string }[];
  };
};

export type InstagramWebhookPayload = {
  object?: string;
  entry?: { id: string; time?: number; messaging?: InstagramMessagingEvent[] }[];
};

/** A readable text for a DM that isn't plain text (photo, reel share…). */
export function dmText(m: NonNullable<InstagramMessagingEvent["message"]>): string | null {
  if (m.text) return m.text;
  const kind = m.attachments?.[0]?.type;
  if (kind) return `[${kind}]`;
  if (m.is_unsupported) return "[unsupported message]";
  return null;
}

