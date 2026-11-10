import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { sendCustomerSms } from "@/lib/sms";

async function load(customerId: string) {
  const business = await getCurrentBusiness();
  if (!business) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const customer = await prisma.customer.findFirst({ where: { id: customerId, businessId: business.id }, include: { location: true } });
  if (!customer) return { error: NextResponse.json({ error: "Customer not found" }, { status: 404 }) };
  return { business, customer };
}

/** GET /api/inbox/:customerId — the conversation; marks inbound messages read. */
export async function GET(_req: NextRequest, { params }: { params: { customerId: string } }) {
  const r = await load(params.customerId);
  if ("error" in r) return r.error;
  const messages = await prisma.message.findMany({
    where: { customerId: r.customer.id, channel: "SMS" },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  await prisma.message.updateMany({ where: { customerId: r.customer.id, direction: "INBOUND", readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ customer: r.customer, messages });
}

const replySchema = z.object({ text: z.string().trim().min(1).max(1000) });

/** POST /api/inbox/:customerId  { text } — owner replies by SMS from the dashboard. */
export async function POST(req: NextRequest, { params }: { params: { customerId: string } }) {
  const r = await load(params.customerId);
  if ("error" in r) return r.error;
  const parsed = replySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message text is required (max 1000 characters)" }, { status: 400 });
  const result = await sendCustomerSms({ business: r.business, location: r.customer.location, customer: r.customer, body: parsed.data.text, purpose: "REPLY" });
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
