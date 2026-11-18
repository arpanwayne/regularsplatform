import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { isPlaceholderPhone, normalizePhone } from "@/lib/phone";
import { addCustomerByStaff, staffAddReply } from "@/lib/onboarding";

/**
 * POST /api/customers — the owner or a manager adds one customer from the
 * dashboard (same as WhatsApping "add Rahul 98…" to the business number).
 * The customer gets a YES/NO request; offers start only after YES.
 */
const schema = z.object({
  name: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().min(6).max(30),
  locationId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "This account is suspended." }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the customer's mobile number." }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone, business.country);
  if (!phone || isPlaceholderPhone(phone)) return NextResponse.json({ error: "That doesn't look like a real mobile number." }, { status: 400 });

  const location = parsed.data.locationId
    ? await prisma.location.findFirst({ where: { id: parsed.data.locationId, businessId: business.id } })
    : await prisma.location.findFirst({ where: { businessId: business.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const r = await addCustomerByStaff(business, location, { name: parsed.data.name || null, phone });
  return NextResponse.json({ outcome: r.outcome, message: staffAddReply(r, business.name), customerId: r.customer.id }, { status: r.outcome.startsWith("NEW") ? 201 : 200 });
}
