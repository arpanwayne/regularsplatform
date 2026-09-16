import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { PLANS } from "@/lib/types";

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  plan: z.enum(PLANS as [string, ...string[]]).optional(),
  atRiskAfterDaysOverride: z.number().int().positive().nullable().optional(),
  dormantAfterDaysOverride: z.number().int().positive().nullable().optional(),
  establishedVisitCountOverride: z.number().int().positive().nullable().optional(),
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

  const updated = await prisma.business.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ business: updated });
}
