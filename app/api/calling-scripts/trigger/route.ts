import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { triggerVoiceCall } from "@/lib/calling-provider";

const schema = z.object({ scriptId: z.string(), customerId: z.string() });

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const result = await triggerVoiceCall({ toPhone: customer.phone, script: script.content });

  const callLog = await prisma.callLog.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      scriptId: script.id,
      generatedContent: script.content,
      status: result.triggered ? "TRIGGERED" : "PENDING",
    },
  });

  return NextResponse.json({ callLog, providerConfigured: result.triggered });
}
