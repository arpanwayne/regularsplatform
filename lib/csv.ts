/**
 * Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF) — enough
 * for customer-list exports from POS / booking tools / spreadsheets, without
 * adding a dependency. Returns rows as objects keyed by lower-cased header.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/**
 * Reads a date the way a customer list writes it. Day-first (15/10/2026,
 * 15-10-2026, 15.10.2026) everywhere except the US, where it's month-first;
 * ISO (2026-10-15) and "15 Oct 2026" work everywhere. Returns null if unreadable.
 * (new Date("15/10/2026") is Invalid Date and new Date("05/10/2026") is 10 May,
 * which is why imports used to skip or garble last-visit dates.)
 */
export function parseListDate(raw: string | null | undefined, country = "IN"): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/);
  if (dmy) {
    let [a, b] = [+dmy[1], +dmy[2]];
    const y = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3];
    const monthFirst = country.toUpperCase() === "US" ? a <= 12 : a <= 12 && b > 12; // 10/15/2026 is clearly month-first
    if (monthFirst) [a, b] = [b, a];
    return build(y, b, a);
  }
  const d = new Date(s); // "15 Oct 2026", "Oct 15, 2026"
  return Number.isNaN(d.getTime()) ? null : build(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function build(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d, 12)); // midday UTC: same calendar day in India and Canada
  return date.getUTCMonth() === m - 1 ? date : null;
}
