import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateResetToken, hashResetToken } from "@/lib/reset-token";
import { sendEmail } from "@/lib/email";
import { allow, clientIp } from "@/lib/rate-limit";
import { BUNDLE_NAME } from "@/lib/brand";

const schema = z.object({ email: z.string().email() });

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  if (!(await allow(`forgot:ip:${clientIp(req)}`, 5, 15 * 60_000))) return NextResponse.json({ error: "Too many requests. Try again in 15 minutes." }, { status: 429 });
  const user = await prisma.user.findFirst({ where: { email: { in: [parsed.data.email, parsed.data.email.toLowerCase()] } } });

  // Always return the same generic response whether or not the email
  // exists — otherwise this endpoint becomes an account-enumeration oracle.
  if (user) {
    const rawToken = generateResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    // process.env.APP_URL is "" (not undefined) when unset via .env.example,
    // so `??` alone wouldn't fall back — `||` catches the empty string too.
    const appUrl = process.env.APP_URL || req.nextUrl.origin;
    const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

    await sendEmail({
      to: user.email,
      subject: `Reset your ${BUNDLE_NAME} password`,
      text: `Use this link to set a new password. It works for one hour.\n\n${resetLink}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
  }

  return NextResponse.json({
    message: "If that email has an account, we've sent a reset link.",
  });
}
