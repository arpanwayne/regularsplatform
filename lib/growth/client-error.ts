/**
 * A Growth AI action's error, as the client should read it (Regulars retest
 * 27 Nov 2026, NEW 3 + NEW 4): a reason in plain words, never server setting
 * names (TWILIO_…, WHATSAPP_SHARED_…) or "Admin → …" instructions.
 * The full error stays in the database and Admin → Logs.
 */
/** Meta held a marketing message back (131049 "healthy ecosystem engagement"). */
export const META_HOLD = /131049|healthy ecosystem/i;

/** After a Meta hold, Retry is pointless for a while: it would fail the same way (B7). */
export const META_HOLD_WAIT_MS = 3 * 24 * 60 * 60 * 1000;

/** When Retry may be pressed again, or null when it may be pressed now. */
export function retryBlockedUntil(a: { error: string | null; updatedAt: Date }, now = new Date()): Date | null {
  if (!META_HOLD.test(String(a.error ?? ""))) return null;
  const until = new Date(a.updatedAt.getTime() + META_HOLD_WAIT_MS);
  return until > now ? until : null;
}

export function clientError(error: string | null | undefined): string {
  const e = String(error ?? "").trim();
  if (!e) return "No reason was recorded. Press Retry, or contact Loopdesk support if it fails again.";
  if (/opted out|STOP/i.test(e)) return "The customer said STOP, so nothing was sent.";
  // B7 (28 Nov 2026): Meta's own words ("…to maintain healthy ecosystem engagement") showed raw.
  if (META_HOLD.test(e)) return "WhatsApp ne abhi ye message rok diya (is customer ko bahut marketing messages gaye). Kuch din baad dobara try hoga.";
  if (/DAILY_LIMIT|limit/i.test(e)) return "WhatsApp held it back (too many marketing messages to this person). It will be tried again tomorrow.";
  if (/WINDOW_CLOSED|template/i.test(e)) return "WhatsApp needs an approved message template for this. Contact Loopdesk support.";
  if (/texting isn't set up|no SMS provider|NOT_SENT|no WhatsApp|WhatsApp not connected|sender|Loopdesk|LOOPDESK|HUB_SECRET/i.test(e)) {
    return "WhatsApp isn't connected yet, so the message couldn't be sent. Press Retry once support has connected it.";
  }
  // Anything else: drop setting names and admin instructions, keep the rest short.
  const plain = e
    .replace(/\(?[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\)?/g, "")
    .replace(/Admin\s*→[^;.)]*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s*\)/g, "")
    .trim();
  return plain.length > 160 ? `${plain.slice(0, 159)}…` : plain || "Something went wrong. Press Retry, or contact Loopdesk support.";
}
