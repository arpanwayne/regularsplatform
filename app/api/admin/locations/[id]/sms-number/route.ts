import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { logEvent } from "@/lib/logger";
import { smsConfigured } from "@/lib/sms";

const schema = z.union([
  // Buy a new Canadian number (local, optionally in an area code, or toll-free).
  z.object({ action: z.literal("buy"), areaCode: z.string().regex(/^\d{3}$/).optional(), tollFree: z.boolean().optional() }),
  // Assign a number already in the Twilio account (e.g. the client's own text-enabled number).
  z.object({ action: z.literal("assign"), number: z.string().regex(/^\+\d{10,15}$/) }),
  z.object({ action: z.literal("release") }),
]);

async function twilio(path: string, init?: RequestInit) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    ...init, headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(data as { message?: string }).message ?? "request failed"}`);
  return data as Record<string, unknown>;
}

/**
 * POST /api/admin/locations/:id/sms-number — super admin gives a location its
 * texting number (doc: "one Canadian texting number per client"). Buying sets
 * the number's inbound-SMS webhook to /api/webhook/sms automatically.
 * Carrier registration (toll-free verification) is still a manual step in
 * the Twilio console before high-volume sending.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const location = await prisma.location.findUnique({ where: { id: params.id } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  if (body.action === "release") {
    const updated = await prisma.location.update({ where: { id: location.id }, data: { smsFromNumber: null, twilioNumberSid: null } });
    return NextResponse.json({ location: updated, note: "Unassigned here; release it in Twilio too if no longer needed." });
  }
  if (body.action === "assign") {
    const updated = await prisma.location.update({ where: { id: location.id }, data: { smsFromNumber: body.number } });
    return NextResponse.json({ location: updated, note: "Point this number's SMS webhook at /api/webhook/sms in Twilio." });
  }

  if (!smsConfigured()) return NextResponse.json({ error: "Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)" }, { status: 503 });
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) return NextResponse.json({ error: "APP_URL must be set so the number's SMS webhook can be configured" }, { status: 503 });
  try {
    const kind = body.tollFree ? "TollFree" : "Local";
    const q = new URLSearchParams({ SmsEnabled: "true", ...(body.areaCode ? { AreaCode: body.areaCode } : {}) });
    const avail = await twilio(`/AvailablePhoneNumbers/CA/${kind}.json?${q}`, { method: "GET" });
    const pick = (avail.available_phone_numbers as { phone_number: string }[] | undefined)?.[0]?.phone_number;
    if (!pick) return NextResponse.json({ error: "No Canadian numbers available for that search" }, { status: 404 });
    const bought = await twilio(`/IncomingPhoneNumbers.json`, {
      method: "POST",
      body: new URLSearchParams({ PhoneNumber: pick, SmsUrl: `${appUrl}/api/webhook/sms`, SmsMethod: "POST", FriendlyName: `Regulars — ${location.name}` }),
    });
    const updated = await prisma.location.update({ where: { id: location.id }, data: { smsFromNumber: pick, twilioNumberSid: String(bought.sid) } });
    await logEvent({ businessId: location.businessId, source: "SMS", level: "INFO", message: `Texting number ${pick} assigned to ${location.name}` });
    return NextResponse.json({ location: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
