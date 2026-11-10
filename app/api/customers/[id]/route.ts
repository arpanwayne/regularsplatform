import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { logEvent } from "@/lib/logger";

// Privacy requests (PIPEDA and similar): a customer can ask for a copy of what
// a business holds about them, or for it to be removed.

async function find(id: string) {
  const business = await getCurrentBusiness();
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
  const found = await find(params.id);
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
