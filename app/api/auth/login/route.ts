import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { allow, clientIp } from "@/lib/rate-limit";
import { createSessionToken, verifyPassword, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const lower = email.toLowerCase();
  const [byIp, byEmail] = await Promise.all([allow(`login:ip:${clientIp(req)}`, 30, 15 * 60_000), allow(`login:email:${lower}`, 10, 15 * 60_000)]);
  if (!byIp || !byEmail) return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });

  const user = await prisma.user.findFirst({ where: { email: { in: [email, lower] } } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSessionToken({ userId: user.id, email: user.email });
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
