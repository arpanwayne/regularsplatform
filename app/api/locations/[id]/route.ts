import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerBusiness } from "@/lib/session";
import { subscribeInstagramWebhooks } from "@/lib/instagram";
import { verifyWhatsAppNumber } from "@/lib/whatsapp-verify";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  whatsappPhoneNumberId: z.string().trim().regex(/^\d{6,25}$/, "Phone number ID is only digits, e.g. 109876543210123 (Meta App Dashboard → WhatsApp → API Setup)").optional(),
  whatsappAccessToken: z.string().trim().min(20, "That doesn't look like a Meta access token").optional(),
  /** Stop using the location's own number (back to the shared number, if any). */
  whatsappDisconnect: z.literal(true).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  // SMS / Front Desk (the texting number itself is assigned by a super admin)
  smsSenderName: z.string().trim().max(40).nullable().optional(),
  bookingUrl: z.string().url().nullable().optional(),
  googleReviewUrl: z.string().url().nullable().optional(),
  ownerNotifyPhone: z.string().regex(/^\+\d{10,15}$/, "Use international format, e.g. +14165550123").nullable().optional(),
  // Instagram DMs → booking (add-on). null disconnects the account.
  instagramAccountId: z.string().trim().regex(/^\d{5,25}$/, "Instagram account ID is a number, e.g. 17841400000000000").nullable().optional(),
  instagramAccessToken: z.string().trim().min(20).optional(),
  instagramUsername: z.string().trim().max(60).transform((u) => u.replace(/^@/, "")).nullable().optional(),
  instagramAutoBooking: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const business = await getOwnerBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const location = await prisma.location.findFirst({
    where: { id: params.id, businessId: business.id },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message ?? "Check the form.", detail: parsed.error.flatten() }, { status: 400 });
  }

  // Own WhatsApp number (bugs 2 + 17, 27 Nov 2026): check the ID and token with
  // Meta before saving, so a wrong value is refused instead of "connected".
  const { whatsappDisconnect, ...fields } = parsed.data;
  let waExtra: { whatsappDisplayNumber?: string | null; whatsappPhoneNumberId?: null; whatsappAccessToken?: null } = {};
  if (whatsappDisconnect) {
    waExtra = { whatsappPhoneNumberId: null, whatsappAccessToken: null, whatsappDisplayNumber: null };
    delete fields.whatsappPhoneNumberId;
    delete fields.whatsappAccessToken;
  } else if (fields.whatsappPhoneNumberId || fields.whatsappAccessToken) {
    const phoneId = fields.whatsappPhoneNumberId ?? location.whatsappPhoneNumberId;
    const token = fields.whatsappAccessToken ?? location.whatsappAccessToken;
    if (!phoneId || !token) {
      return NextResponse.json({ error: "Enter both the Phone number ID and the access token." }, { status: 400 });
    }
    const check = await verifyWhatsAppNumber(phoneId, token);
    if (!check.ok) return NextResponse.json({ error: `Meta didn't accept this number: ${check.error}` }, { status: 400 });
    if (fields.whatsappPhoneNumberId) {
      const taken = await prisma.location.findFirst({ where: { whatsappPhoneNumberId: fields.whatsappPhoneNumberId, NOT: { id: location.id } }, select: { id: true } });
      if (taken) return NextResponse.json({ error: "This WhatsApp number is already connected to another location." }, { status: 409 });
    }
    waExtra = { whatsappDisplayNumber: check.displayNumber };
  }

  const data = {
    ...fields,
    ...waExtra,
    // A freshly pasted token starts its 60 days now.
    ...(parsed.data.instagramAccessToken ? { instagramTokenRefreshedAt: new Date() } : {}),
    ...(parsed.data.instagramAccountId === null ? { instagramAccessToken: null, instagramUsername: null, instagramTokenRefreshedAt: null } : {}),
  };
  if (data.instagramAccountId) {
    const taken = await prisma.location.findFirst({ where: { instagramAccountId: data.instagramAccountId, NOT: { id: location.id } }, select: { id: true } });
    if (taken) return NextResponse.json({ error: "This Instagram account is already connected to another location." }, { status: 409 });
  }
  const updated = await prisma.location.update({
    where: { id: location.id },
    data,
  });

  // New account or token: subscribe the app to its DMs, or Meta sends nothing.
  let instagramWarning: string | null = null;
  if ((parsed.data.instagramAccountId || parsed.data.instagramAccessToken) && updated.instagramAccountId && updated.instagramAccessToken) {
    const err = await subscribeInstagramWebhooks(updated);
    if (err) instagramWarning = `Saved, but Meta didn't subscribe this account to messages: ${err}`;
  }

  // Never send saved tokens back to the browser.
  return NextResponse.json({ location: { ...updated, whatsappAccessToken: null, instagramAccessToken: null }, instagramWarning });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const business = await getOwnerBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [location, locationCount] = await Promise.all([
    prisma.location.findFirst({ where: { id: params.id, businessId: business.id } }),
    prisma.location.count({ where: { businessId: business.id } }),
  ]);
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  if (locationCount <= 1) {
    return NextResponse.json(
      { error: "Can't delete the only location — a business needs at least one" },
      { status: 400 }
    );
  }

  await prisma.location.delete({ where: { id: location.id } });
  return NextResponse.json({ ok: true });
}
