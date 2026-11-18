import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness, getOwnerBusiness } from "@/lib/session";
import { logEvent } from "@/lib/logger";
import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

// Privacy requests (PIPEDA and similar): a customer can ask for a copy of what
// a business holds about them, or for it to be removed.

// Removing a customer's data is the owner's call; managers can view and edit.
async function find(id: string, ownerOnly = false) {
  const business = ownerOnly ? await getOwnerBusiness() : await getCurrentBusiness();
  if (!business) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const customer = await prisma.customer.findFirst({ where: { id, businessId: business.id } });
  if (!customer) return { error: NextResponse.json({ error: "Customer not found" }, { status: 404 }) };
  return { business, customer };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const found = await find(params.id);
  if (found.error) return found.error;
  const { customer } = found;
  const [messages, visits, calls, events] = await Promise.all([
    prisma.message.findMany({ where: { customerId: customer.id }, select: { direction: true, channel: true, text: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.visit.findMany({ where: { customerId: customer.id }, orderBy: { occurredAt: "asc" } }),
    prisma.callLog.findMany({ where: { customerId: customer.id }, select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.growthEvent.findMany({ where: { customerId: customer.id }, select: { type: true, occurredAt: true, value: true }, orderBy: { occurredAt: "asc" } }),
  ]);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), customer: { name: customer.name, phone: customer.phone, visits: customer.visitCount, totalSpend: customer.totalSpend, firstSeen: customer.firstSeenAt, lastSeen: customer.lastSeenAt, optedOut: customer.optedOut || customer.smsOptedOut }, messages, visits, calls, events }, null, 2);
  return new NextResponse(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="customer-${customer.id}.json"` } });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const found = await find(params.id, true);
  if (found.error) return found.error;
  const { business, customer } = found;

  if (customer.optedOut || customer.smsOptedOut) {
    // Keep only the number and the opt-out, or a later import could text them again.
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { customerId: customer.id } }),
      prisma.visit.deleteMany({ where: { customerId: customer.id } }),
      prisma.callLog.deleteMany({ where: { customerId: customer.id } }),
      prisma.growthEvent.deleteMany({ where: { customerId: customer.id } }),
      prisma.growthAction.deleteMany({ where: { customerId: customer.id } }),
      prisma.customer.update({ where: { id: customer.id }, data: { name: null, visitCount: 0, totalSpend: 0 } }),
    ]);
  } else {
    await prisma.customer.delete({ where: { id: customer.id } }); // history cascades
  }
  await logEvent({ businessId: business.id, source: "PRIVACY", level: "INFO", message: "Customer data removed on request" });
  return NextResponse.json({ ok: true, keptOptOut: customer.optedOut || customer.smsOptedOut });
}

const editSchema = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().min(5).max(25).optional(),
});

/** PATCH /api/customers/:id { name?, phone? } — the owner corrects a customer's name or number. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const found = await find(params.id);
  if (found.error) return found.error;
  const { business, customer } = found;
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "Business is suspended" }, { status: 403 });
  const parsed = editSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid name or number" }, { status: 400 });

  const data: { name?: string | null; phone?: string } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name || null;
  if (parsed.data.phone !== undefined) {
    const phone = normalizePhone(parsed.data.phone, business.country);
    if (!phone) return NextResponse.json({ error: "That doesn't look like a phone number. Include the country code, e.g. +91 98765 43210." }, { status: 400 });
    if (phone !== customer.phone) {
      const clash = await prisma.customer.findUnique({ where: { locationId_phone: { locationId: customer.locationId, phone } }, select: { id: true } });
      if (clash) return NextResponse.json({ error: "Another customer at this location already has this number." }, { status: 409 });
      data.phone = phone;
    }
  }
  const updated = await prisma.customer.update({ where: { id: customer.id }, data });
  if (data.phone) {
    await logEvent({ businessId: business.id, source: "API", level: "INFO", message: "Customer number changed by owner", meta: { customerId: customer.id } });
  }
  return NextResponse.json({ ok: true, customer: { id: updated.id, name: updated.name, phone: updated.phone } });
}
