import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerBusiness } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { isPlaceholderPhone, normalizePhone } from "@/lib/phone";
import { logEvent } from "@/lib/logger";
import { sendOwnerWhatsApp } from "@/lib/whatsapp-send";

/**
 * Dashboard → Team (owner only). A manager is a staff login for one business:
 * they add customers, write offers and use the inbox. Their mobile is how the
 * business number recognises them on WhatsApp ("add Rahul 98…").
 */

export async function GET() {
  const business = await getOwnerBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const managers = await prisma.user.findMany({
    where: { managedBusinessId: business.id, role: "MANAGER" },
    select: { id: true, name: true, email: true, phone: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ managers });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().min(6).max(30),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const business = await getOwnerBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Name, a valid email, mobile and a password of 8+ characters are needed." }, { status: 400 });
  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const phone = normalizePhone(parsed.data.phone, business.country);
  if (!phone || isPlaceholderPhone(phone)) return NextResponse.json({ error: "Enter the manager's real mobile number." }, { status: 400 });

  if (await prisma.user.findFirst({ where: { email: { in: [email, parsed.data.email] } } })) {
    return NextResponse.json({ error: "Someone already uses this email. Use a different email for the manager." }, { status: 409 });
  }
  const manager = await prisma.user.create({
    data: { name, email, phone, role: "MANAGER", managedBusinessId: business.id, passwordHash: await hashPassword(password) },
    select: { id: true, name: true, email: true, phone: true, createdAt: true },
  });
  await logEvent({ businessId: business.id, source: "AUTH", level: "INFO", message: `Manager added: ${email}` });

  // Bug 11 (27 Nov 2026): tell the manager on WhatsApp (template — they haven't written to us yet).
  // A failed send never undoes the add; the owner sees it on the Team page.
  const location = await prisma.location.findFirst({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  const base = (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, "");
  const welcomed = await sendOwnerWhatsApp(business, location, phone, {
    templateKey: "manager_welcome", params: [name.split(/\s+/)[0] || name, business.name, `${base}/login`],
  }).catch(() => false);
  if (!welcomed) await logEvent({ businessId: business.id, source: "WHATSAPP", level: "WARN", message: `Manager welcome WhatsApp not sent to +${phone}`, meta: { hint: "No WhatsApp number for this business, or the manager_welcome template isn't approved yet (Admin → WhatsApp templates)." } });
  return NextResponse.json({ manager, welcomed }, { status: 201 });
}
