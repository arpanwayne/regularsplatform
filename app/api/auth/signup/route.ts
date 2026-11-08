import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionToken, hashPassword, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { SECTORS } from "@/lib/types";
import { BUNDLE_PLAN_IDS } from "@/lib/hub/plans";
import { normalizePhone, toE164 } from "@/lib/phone";

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(1),
  sector: z.enum(SECTORS as [string, ...string[]]),
  // Bundle A signup (one platform). Optional so the plain Regulars signup
  // keeps working unchanged.
  bundlePlan: z.enum(BUNDLE_PLAN_IDS as [string, ...string[]]).optional(),
  country: z.enum(["CA", "IN"]).optional(),
  phone: z.string().max(30).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, email, password, businessName, sector, bundlePlan, country, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const digits = phone?.trim() ? normalizePhone(phone, country ?? "IN") : null;
  const ownerPhone = digits ? toE164(digits) : null;
  if (bundlePlan && phone?.trim() && !digits) {
    return NextResponse.json({ error: "That mobile number doesn't look right" }, { status: 400 });
  }
  const india = (country ?? "IN") === "IN";

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      businesses: {
        create: {
          name: businessName,
          sector,
          // Every business needs at least one Location to connect WhatsApp
          // to (see Location model) — auto-create one named after the
          // business itself so a single-outlet signup needs no extra step.
          // Multi-location chains add more from Settings.
          locations: { create: { name: businessName } },
          ...(bundlePlan
            ? {
                country: country ?? "IN",
                defaultChannel: india ? "WHATSAPP" : "SMS",
                frontDeskPlan: bundlePlan,
                bundleStatus: "PENDING_PAYMENT",
                growthSettings: {
                  create: {
                    ownerPhone,
                    timezone: india ? "Asia/Kolkata" : "America/Toronto",
                    currency: india ? "INR" : "CAD",
                    avgJobValue: india ? 1500 : 250,
                    messageLanguage: india ? "hinglish" : "en",
                    callQuoteAbove: india ? 20000 : 500,
                  },
                },
              }
            : {}),
        },
      },
    },
    include: { businesses: true },
  });

  const token = await createSessionToken({ userId: user.id, email: user.email });
  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    next: bundlePlan ? "/dashboard/billing" : "/dashboard",
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
