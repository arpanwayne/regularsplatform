/**
 * A Growth AI action's error, as the client should read it (Regulars retest
 * 27 Nov 2026, NEW 3 + NEW 4): a reason in plain words, never server setting
 * names (TWILIO_…, WHATSAPP_SHARED_…) or "Admin → …" instructions.
 * The full error stays in the database and Admin → Logs.
 */
export function clientError(error: string | null | undefined): string {
  const e = String(error ?? "").trim();
  if (!e) return "No reason was recorded. Press Retry, or contact Loopdesk support if it fails again.";
  if (/opted out|STOP/i.test(e)) return "The customer said STOP, so nothing was sent.";
  if (/131049|DAILY_LIMIT|limit/i.test(e)) return "WhatsApp held it back (too many marketing messages to this person). It will be tried again tomorrow.";
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
