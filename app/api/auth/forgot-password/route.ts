import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateResetToken, hashResetToken } from "@/lib/reset-token";
import { sendEmail } from "@/lib/email";

const schema = z.object({ email: z.string().email() });

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

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
      subject: "Reset your Regulars password",
      text: `Password reset link (valid 1 hour): ${resetLink}\n\nIf you didn't request this, ignore this email.`,
    });
  }

  return NextResponse.json({
    message: "Agar yeh email registered hai, to ek reset link bheja gaya hai.",
  });
}
