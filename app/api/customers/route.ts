import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { isPlaceholderPhone, mobileProblem, normalizePhone, oneDigitAway } from "@/lib/phone";
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
  /** The owner saw "a similar number already exists" and adds it anyway (B8). */
  confirmSimilar: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "This account is suspended." }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the customer's mobile number." }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone, business.country);
  if (!phone || isPlaceholderPhone(phone)) return NextResponse.json({ error: "That doesn't look like a real mobile number." }, { status: 400 });
  // B8 (28 Nov 2026): country code + length, then "is this the same person?".
  const problem = mobileProblem(phone);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (!parsed.data.confirmSimilar) {
    const near = await prisma.customer.findMany({
      where: { businessId: business.id, phone: { startsWith: phone.slice(0, 2) }, NOT: { phone } },
      select: { name: true, phone: true }, take: 20000,
    });
    const similar = near.find((c) => oneDigitAway(c.phone, phone));
    if (similar) {
      return NextResponse.json({
        error: `${similar.name ? `${similar.name} ` : ""}+${similar.phone} is already a customer — just one digit different. Same person? Fix the number, or press Add again to add it anyway.`,
        code: "SIMILAR_NUMBER",
      }, { status: 409 });
    }
  }

  const location = parsed.data.locationId
    ? await prisma.location.findFirst({ where: { id: parsed.data.locationId, businessId: business.id } })
    : await prisma.location.findFirst({ where: { businessId: business.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const r = await addCustomerByStaff(business, location, { name: parsed.data.name || null, phone });
  return NextResponse.json({ outcome: r.outcome, message: staffAddReply(r, business.name), customerId: r.customer.id }, { status: r.outcome.startsWith("NEW") ? 201 : 200 });
}
