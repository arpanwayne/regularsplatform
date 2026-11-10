import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { textBackMissedCall, upsertCustomer } from "@/lib/front-desk";

const schema = z.object({
  phone: z.string().min(5),
  locationId: z.string().optional(),
  reason: z.enum(["hung_up", "no_answer", "failed"]).optional(),
  callId: z.string().max(200).optional(),
  name: z.string().trim().max(100).optional(),
});

/**
 * POST /api/v1/front-desk/missed-call — called by WayneRing when a caller
 * hangs up or the call fails. Texts the caller the location's booking link
 * (once per 12h per caller). Same API keys as /api/v1/events.
 *
 * Body: { "phone": "+16475550111", "locationId"?: "...", "reason"?: "hung_up", "callId"?: "..." }
 * Reply: { status: QUEUED | SENT | NOT_SENT | DUPLICATE | OPTED_OUT | NO_NUMBER | FAILED }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  if (auth.suspended) return NextResponse.json({ error: "Business is suspended" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.business.id } });
  const phone = normalizePhone(parsed.data.phone, business.country);
  if (!phone) return NextResponse.json({ error: "phone is not a valid number" }, { status: 400 });

  const location = parsed.data.locationId
    ? await prisma.location.findFirst({ where: { id: parsed.data.locationId, businessId: business.id } })
    : await prisma.location.findFirst({ where: { businessId: business.id, smsFromNumber: { not: null } }, orderBy: { createdAt: "asc" } });
  if (!location) return NextResponse.json({ error: "No location with a texting number" }, { status: 404 });

  const customer = await upsertCustomer(business, location, phone, parsed.data.name);
  const result = await textBackMissedCall(business, location, customer);
  return NextResponse.json({ status: result.status, customerId: customer.id });
}
