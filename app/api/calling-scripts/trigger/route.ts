import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { triggerVoiceCall } from "@/lib/calling-provider";
import { recordUsageEvent } from "@/lib/usage";
import { logEvent } from "@/lib/logger";

const schema = z.object({ scriptId: z.string(), customerId: z.string() });

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (business.status === "SUSPENDED") {
    return NextResponse.json({ error: "This business account is suspended" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "scriptId and customerId required" }, { status: 400 });
  }

  const [script, customer] = await Promise.all([
    prisma.callingScript.findFirst({ where: { id: parsed.data.scriptId, businessId: business.id } }),
    prisma.customer.findFirst({ where: { id: parsed.data.customerId, businessId: business.id } }),
  ]);
  if (!script || !customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (customer.optedOut) {
    return NextResponse.json(
      { error: "Customer has opted out of WhatsApp/calling outreach" },
      { status: 409 }
    );
  }

  let status: "TRIGGERED" | "PENDING" | "FAILED" = "PENDING";
  let providerConfigured = false;
  try {
    const result = await triggerVoiceCall({ toPhone: customer.phone, script: script.content });
    status = result.triggered ? "TRIGGERED" : "PENDING";
    providerConfigured = result.triggered;
  } catch (err) {
    status = "FAILED";
    await logEvent({
      businessId: business.id,
      source: "CALLING_SCRIPT",
      level: "ERROR",
      message: "Voice call trigger threw an error",
      meta: { customerId: customer.id, error: err instanceof Error ? err.message : String(err) },
    });
  }

  if (status === "TRIGGERED") {
    await recordUsageEvent({ businessId: business.id, type: "VOICE_CALL", callTriggered: true });
  }

  const callLog = await prisma.callLog.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      scriptId: script.id,
      generatedContent: script.content,
      status,
    },
  });

  return NextResponse.json({ callLog, providerConfigured });
}
