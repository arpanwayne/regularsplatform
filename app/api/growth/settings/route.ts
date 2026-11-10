import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { getSettings } from "@/lib/growth/settings";
import { ACTION_TYPES, AUTONOMY_LEVELS, GOALS } from "@/lib/growth/types";

const schema = z.object({
  enabled: z.boolean().optional(),
  goal: z.enum(GOALS as [string, ...string[]]).optional(),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown timezone").optional(),
  currency: z.enum(["CAD", "USD", "INR", "GBP", "AUD"]).optional(),
  avgJobValue: z.number().min(1).max(10_000_000).optional(),
  messageLanguage: z.enum(["en", "hinglish", "hi", "pa"]).optional(),
  briefHour: z.number().int().min(0).max(23).optional(),
  contactFromHour: z.number().int().min(6).max(21).optional(),
  contactToHour: z.number().int().min(8).max(22).optional(),
  maxTouchesPerWeek: z.number().int().min(1).max(5).optional(),
  dailyActionCap: z.number().int().min(1).max(200).optional(),
  serviceIntervalDays: z.number().int().min(7).max(730).nullable().optional(),
  quoteFollowupDays: z.number().int().min(1).max(30).optional(),
  callQuoteAbove: z.number().min(0).optional(),
  autonomy: z.record(z.enum(ACTION_TYPES), z.enum(AUTONOMY_LEVELS as [string, ...string[]])).optional(),
  ownerPhone: z.string().regex(/^\+\d{8,15}$/, "Use +countrycode format").nullable().optional(),
  wayneRingBaseUrl: z.string().url().nullable().optional(),
  wayneRingCallbackKey: z.string().startsWith("wrcb_").nullable().optional(),
  gmbLocationId: z.string().max(100).nullable().optional(),
  videoStudioClientId: z.string().max(50).nullable().optional(),
}).refine((v) => v.contactFromHour == null || v.contactToHour == null || v.contactFromHour < v.contactToHour, "Contact hours: start must be before end");

/** PATCH /api/growth/settings — owner settings for the AI Growth Manager. */
export async function PATCH(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await getSettings(business);
  const { autonomy, ...rest } = parsed.data;
  const updated = await prisma.growthSettings.update({
    where: { businessId: business.id },
    data: { ...rest, ...(autonomy ? { autonomy: JSON.stringify(autonomy) } : {}) },
  });
  const { wayneRingCallbackKey, ...safe } = updated;
  return NextResponse.json({ settings: { ...safe, wayneRingCallbackKeySet: !!wayneRingCallbackKey } });
}
