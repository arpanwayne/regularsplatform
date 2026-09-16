import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      usageEvents: {
        select: { type: true, inputTokens: true, outputTokens: true, estimatedCostUsd: true, callTriggered: true },
      },
    },
  });

  const perBusiness = businesses.map((b) => {
    const aiEvents = b.usageEvents.filter((e) => e.type === "AI_SCRIPT_PERSONALIZATION");
    const callEvents = b.usageEvents.filter((e) => e.type === "VOICE_CALL" && e.callTriggered);
    return {
      businessId: b.id,
      businessName: b.name,
      aiScriptCalls: aiEvents.length,
      estimatedAiCostUsd: aiEvents.reduce((sum, e) => sum + (e.estimatedCostUsd ?? 0), 0),
      voiceCallsTriggered: callEvents.length,
    };
  });

  return NextResponse.json({ businesses: perBusiness });
}
