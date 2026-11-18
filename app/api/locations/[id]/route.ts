import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerBusiness } from "@/lib/session";
import { subscribeInstagramWebhooks } from "@/lib/instagram";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  whatsappPhoneNumberId: z.string().min(1).optional(),
  whatsappAccessToken: z.string().min(1).optional(),
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = {
    ...parsed.data,
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
