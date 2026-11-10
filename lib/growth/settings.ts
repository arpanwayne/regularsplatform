import type { GrowthSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTION_TYPES, AUTONOMY_LEVELS, DEFAULT_AUTONOMY, type ActionType, type Autonomy } from "@/lib/growth/types";

export const DAY = 24 * 60 * 60 * 1000;

/** Settings row for a business, created with defaults on first use (timezone/currency from the country). */
export async function getSettings(business: { id: string; country: string }) {
  const existing = await prisma.growthSettings.findUnique({ where: { businessId: business.id } });
  if (existing) return existing;
  const india = business.country === "IN";
  return prisma.growthSettings.create({
    data: {
      businessId: business.id,
      timezone: india ? "Asia/Kolkata" : "America/Toronto",
      currency: india ? "INR" : "CAD",
      avgJobValue: india ? 1500 : 250,
      messageLanguage: india ? "hinglish" : "en",
      callQuoteAbove: india ? 20000 : 500,
    },
  });
}

export function autonomyFor(settings: Pick<GrowthSettings, "autonomy">, type: ActionType): Autonomy {
  try {
    const map = JSON.parse(settings.autonomy || "{}") as Record<string, string>;
    const v = map[type];
    if (v && (AUTONOMY_LEVELS as string[]).includes(v)) return v as Autonomy;
  } catch { /* fall through */ }
  return DEFAULT_AUTONOMY[type];
}

export function autonomyMap(settings: Pick<GrowthSettings, "autonomy">) {
  return Object.fromEntries(ACTION_TYPES.map((t) => [t, autonomyFor(settings, t)])) as Record<ActionType, Autonomy>;
}

/** Date, hour and weekday of `date` in `tz`. */
export function localParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, weekday: get("weekday") };
}

/** ISO week label ("2026-W46") of a YYYY-MM-DD date. */
export function isoWeek(ymd: string) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function withinContactHours(s: Pick<GrowthSettings, "timezone" | "contactFromHour" | "contactToHour">, now = new Date()) {
  const { hour } = localParts(now, s.timezone);
  return hour >= s.contactFromHour && hour < s.contactToHour;
}

export function money(s: Pick<GrowthSettings, "currency">, v: number) {
  const sym = s.currency === "INR" ? "₹" : s.currency === "USD" ? "$" : s.currency === "CAD" ? "$" : `${s.currency} `;
  return `${sym}${Math.round(v).toLocaleString(s.currency === "INR" ? "en-IN" : "en-CA")}`;
}

export const parseJson = <T = Record<string, unknown>>(s: string | null | undefined, fallback: T): T => {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
};
