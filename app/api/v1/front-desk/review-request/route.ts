import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { sendReviewRequest, upsertCustomer } from "@/lib/front-desk";

const schema = z.object({
  phone: z.string().min(5),
  name: z.string().trim().max(100).optional(),
  locationId: z.string().optional(),
});

/**
 * POST /api/v1/front-desk/review-request — ask a customer for a Google review
 * after a visit (e.g. called by a booking tool when an appointment is marked
 * done). Businesses with autoReviewRequest on get this automatically for
 * every VISIT pushed to /api/v1/events.
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
    : await prisma.location.findFirst({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const customer = await upsertCustomer(business, location, phone, parsed.data.name);
  const result = await sendReviewRequest(business, location, customer);
  return NextResponse.json({ status: result.status, customerId: customer.id });
}
