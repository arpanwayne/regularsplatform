// Phone numbers are stored as digits with the country code and no "+"
// (the WhatsApp wa_id format), e.g. "14165550123" / "919876543210".

const COUNTRY_CODE: Record<string, string> = { CA: "1", US: "1", IN: "91", GB: "44", AU: "61", AE: "971" };

/**
 * Normalises a phone typed by a person or sent by another system.
 * "+1 (416) 555-0123" → "14165550123"; "416-555-0123" with country CA → "14165550123";
 * "9876543210" with country IN → "919876543210". Returns null when it can't be a phone.
 */
export function normalizePhone(raw: string | null | undefined, country = "IN"): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const plus = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);
  if (!plus) {
    const cc = COUNTRY_CODE[country.toUpperCase()] ?? "";
    // A local number without its country code.
    if (cc === "1" && digits.length === 10) digits = "1" + digits;
    else if (cc === "91" && digits.length === 10) digits = "91" + digits;
    else if (cc === "91" && digits.length === 11 && digits.startsWith("0")) digits = "91" + digits.slice(1);
    else if (cc && digits.length <= 10) digits = cc + digits;
  }
  return /^\d{11,15}$/.test(digits) ? digits : null;
}

export function toE164(digits: string) {
  return digits.startsWith("+") ? digits : `+${digits}`;
}
