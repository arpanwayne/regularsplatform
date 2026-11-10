import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signedUrl, verifyTwilioSignature } from "@/lib/sms";

const KNOWN = ["QUEUED", "SENDING", "SENT", "DELIVERED", "UNDELIVERED", "FAILED"];

/** POST /api/webhook/sms/status — Twilio delivery receipts (StatusCallback). */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  if (!verifyTwilioSignature(signedUrl(req), params, req.headers.get("x-twilio-signature"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }
  const sid = params.MessageSid, status = (params.MessageStatus || "").toUpperCase();
  if (sid && KNOWN.includes(status)) {
    await prisma.message.updateMany({ where: { providerSid: sid }, data: { status } });
  }
  return new NextResponse(null, { status: 204 });
}
