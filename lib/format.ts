// Dates and money as the business's own country writes them. Servers run in
// UTC, so dates are always shown in the business's time zone.
export const localeFor = (country?: string | null) => (country === "IN" ? "en-IN" : country === "CA" ? "en-CA" : "en-US");
export const defaultTimeZone = (country?: string | null) => (country === "IN" ? "Asia/Kolkata" : "America/Toronto");

export function formatDate(value: Date | string, country?: string | null, timeZone?: string | null) {
  return new Date(value).toLocaleDateString(localeFor(country), { dateStyle: "medium", timeZone: timeZone || defaultTimeZone(country) });
}

export function formatDateTime(value: Date | string, country?: string | null, timeZone?: string | null) {
  return new Date(value).toLocaleString(localeFor(country), { dateStyle: "medium", timeStyle: "short", timeZone: timeZone || defaultTimeZone(country) });
}
