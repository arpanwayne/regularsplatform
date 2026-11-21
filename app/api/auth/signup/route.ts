import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { allow, clientIp } from "@/lib/rate-limit";
import { createSessionToken, hashPassword, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { SECTORS } from "@/lib/types";

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  businessName: z.string().min(1),
  sector: z.enum(SECTORS as [string, ...string[]]),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, password, businessName, sector } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  if (!(await allow(`signup:ip:${clientIp(req)}`, 10, 60 * 60_000))) return NextResponse.json({ error: "Too many signups from this connection. Try again later." }, { status: 429 });

  const existing = await prisma.user.findFirst({ where: { email: { in: [email, parsed.data.email] } } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

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
        },
      },
    },
    include: { businesses: true },
  });

  const token = await createSessionToken({ userId: user.id, email: user.email });
  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    next: "/dashboard",
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
