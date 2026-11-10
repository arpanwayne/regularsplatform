import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { FRONT_DESK_PLANS, FRONT_DESK_SMS_LIMIT, PLANS, type FrontDeskPlan } from "@/lib/types";

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  plan: z.enum(PLANS as [string, ...string[]]).optional(),
  atRiskAfterDaysOverride: z.number().int().positive().nullable().optional(),
  dormantAfterDaysOverride: z.number().int().positive().nullable().optional(),
  establishedVisitCountOverride: z.number().int().positive().nullable().optional(),
  // WayneRing AI Front Desk plan + SMS allowance (C$0.05 per SMS over the limit).
  frontDeskPlan: z.enum(FRONT_DESK_PLANS as [string, ...string[]]).nullable().optional(),
  smsMonthlyLimit: z.number().int().min(0).nullable().optional(),
  smsOverageRateCad: z.number().min(0).max(1).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const business = await prisma.business.findUnique({ where: { id: params.id } });
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const data = { ...parsed.data };
  // Picking a Front Desk plan sets its SMS allowance unless one was given explicitly.
  if (data.frontDeskPlan && data.smsMonthlyLimit === undefined) {
    data.smsMonthlyLimit = FRONT_DESK_SMS_LIMIT[data.frontDeskPlan as FrontDeskPlan];
  }
  const updated = await prisma.business.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ business: updated });
}
