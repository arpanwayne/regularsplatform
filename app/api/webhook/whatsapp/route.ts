import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyMessageType, isOptOutMessage, isQualifyingVisit, verifyWebhookSignature, WhatsAppWebhookPayload } from "@/lib/whatsapp";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";

// GET — Meta's webhook verification handshake. Each business gets its own
// whatsappVerifyToken (shown on the Settings page); we also accept the
// global WHATSAPP_WEBHOOK_VERIFY_TOKEN for a first-time setup before any
// business has configured its own.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  const business = await prisma.business.findFirst({ where: { whatsappVerifyToken: token } });
  if (business) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// POST — inbound WhatsApp events. This is the "passive data capture" path:
// every customer message that lands here silently builds/updates that
// customer's profile, with zero setup from the business owner beyond
// pointing their WABA webhook at this URL.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const affectedBusinessIds = new Set<string>();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { value } = change;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId || !value.messages?.length) continue;

      const business = await prisma.business.findUnique({
        where: { whatsappPhoneNumberId: phoneNumberId },
      });
      // Unrecognized phone_number_id (e.g. business hasn't finished setup
      // yet) — ack with 200 so Meta doesn't retry, but do nothing.
      if (!business) continue;
      // Suspended by a super admin (see /admin) — stop ingesting for this
      // business without erroring the webhook itself.
      if (business.status === "SUSPENDED") continue;

      const contactsByWaId = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name])
      );

      for (const message of value.messages) {
        const text = message.text?.body;
        const messageType = classifyMessageType(text);
        const optOut = isOptOutMessage(text);
        const now = new Date();

        const customer = await prisma.customer.upsert({
          where: { businessId_phone: { businessId: business.id, phone: message.from } },
          create: {
            businessId: business.id,
            phone: message.from,
            name: contactsByWaId.get(message.from) ?? null,
            firstSeenAt: now,
            lastSeenAt: now,
            visitCount: isQualifyingVisit(messageType) ? 1 : 0,
            optedOut: optOut,
            optedOutAt: optOut ? now : null,
          },
          update: {
            name: contactsByWaId.get(message.from) ?? undefined,
            lastSeenAt: now,
            ...(isQualifyingVisit(messageType) ? { visitCount: { increment: 1 } } : {}),
            // Opt-outs are one-directional here: once set, only the business
            // owner can undo it via Settings, not a later inbound message.
            ...(optOut ? { optedOut: true, optedOutAt: now } : {}),
          },
        });

        await prisma.message.create({
          data: {
            businessId: business.id,
            customerId: customer.id,
            direction: "INBOUND",
            type: messageType,
            text: text ?? null,
            rawPayload: JSON.stringify(message),
          },
        });

        if (isQualifyingVisit(messageType)) {
          await prisma.visit.create({
            data: {
              businessId: business.id,
              customerId: customer.id,
              occurredAt: now,
              source: `whatsapp:${messageType.toLowerCase()}`,
            },
          });
        }

        affectedBusinessIds.add(business.id);
      }
    }
  }

  for (const businessId of affectedBusinessIds) {
    await runSegmentationForBusiness(businessId);
  }

  return NextResponse.json({ received: true });
}
