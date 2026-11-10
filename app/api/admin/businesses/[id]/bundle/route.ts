import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { logEvent } from "@/lib/logger";
import { activateBundle } from "@/lib/hub/bundle";
import { provisionBusiness } from "@/lib/hub/provision";
import { BUNDLE_PLAN_IDS } from "@/lib/hub/plans";
import type { FrontDeskPlan } from "@/lib/types";

const schema = z.discriminatedUnion("action", [
  // Paid offline (e-Transfer, cheque, bank) or a free pilot.
  z.object({ action: z.literal("activate"), plan: z.enum(BUNDLE_PLAN_IDS as [string, ...string[]]), days: z.number().int().min(1).max(366), note: z.string().max(200).optional() }),
  // Re-run the automatic set-up (after fixing a tool's env, say).
  z.object({ action: z.literal("reprovision") }),
  // Issue fresh Regulars keys to WayneRing and the Field Service CRM.
  z.object({ action: z.literal("rotate-keys") }),
]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const business = await prisma.business.findUnique({ where: { id: params.id } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const body = parsed.data;
  if (body.action === "activate") {
    const r = await activateBundle(business.id, body.plan as FrontDeskPlan, { days: body.days, reason: `admin ${admin.email}${body.note ? `: ${body.note}` : ""}` });
    return NextResponse.json(r);
  }
  await logEvent({ businessId: business.id, source: "BILLING", level: "INFO", message: `Admin ${admin.email} ran ${body.action}` });
  const tools = await provisionBusiness(business.id, { rotateKeys: body.action === "rotate-keys" });
  return NextResponse.json({ tools });
}
