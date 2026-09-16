import { MessageType } from "@/lib/types";

// Minimal shape of a Meta WhatsApp Cloud API webhook payload — only the
// fields Regulars actually reads. See:
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
export type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
};

const KEYWORD_MAP: Array<{ type: MessageType; keywords: string[] }> = [
  {
    type: "BOOKING_CONFIRMATION",
    keywords: ["booking", "booked", "confirm", "reservation", "slot"],
  },
  {
    type: "ORDER_UPDATE",
    keywords: ["order", "delivery", "shipped", "invoice", "bill", "payment"],
  },
  {
    type: "APPOINTMENT_REMINDER",
    keywords: ["appointment", "reminder", "visit", "checkup", "session"],
  },
];

/**
 * Passive-capture classifier: no business setup required. We guess the
 * transactional intent of a message from its text so it can be logged as a
 * Visit signal, per the PDF's "zero manual effort" requirement. Falls back
 * to OTHER for free-form chat, which still updates recency/engagement but
 * isn't counted as a qualifying visit event.
 */
export function classifyMessageType(text: string | undefined): MessageType {
  if (!text) return "OTHER";
  const lower = text.toLowerCase();
  for (const { type, keywords } of KEYWORD_MAP) {
    if (keywords.some((k) => lower.includes(k))) {
      return type;
    }
  }
  return "OTHER";
}

export function isQualifyingVisit(type: MessageType): boolean {
  return type !== "OTHER";
}

/**
 * Verifies Meta's app-secret HMAC signature on the webhook body, when
 * WHATSAPP_APP_SECRET is configured. Skips verification (returns true) when
 * unset, so the webhook still works during local setup before Meta App
 * Review is complete — tighten this before going live.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expectedHex = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (actualHex.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actualHex.length; i++) {
    mismatch |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}
