import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerBusiness } from "@/lib/session";

/** PATCH /api/offers/limits — the owner sets what a manager's offer may do without asking. */
const schema = z.object({
  approvalMaxDiscount: z.number().int().min(0).max(100),
  approvalMaxAudience: z.number().int().min(0).max(100000),
  approvalAutoFreebie: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const business = await getOwnerBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Discount 0–100%, customers 0–100,000." }, { status: 400 });
  const updated = await prisma.business.update({ where: { id: business.id }, data: parsed.data, select: { approvalMaxDiscount: true, approvalMaxAudience: true, approvalAutoFreebie: true } });
  return NextResponse.json(updated);
}
