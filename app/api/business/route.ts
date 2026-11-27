import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerBusiness } from "@/lib/session";

const patchSchema = z.object({
  // The name customers see in every message ("<name> aapko offers bhejna chahta hai"), bug 9.
  name: z.string().trim().min(2, "Business name is too short").max(80).optional(),
  defaultChannel: z.enum(["WHATSAPP", "SMS"]).optional(),
  country: z.string().length(2).transform((c) => c.toUpperCase()).optional(),
  autoReviewRequest: z.boolean().optional(),
});

// PATCH /api/business — owner-editable messaging settings. Plan and SMS
// limits are set by a super admin (app/api/admin/businesses/[id]).
export async function PATCH(req: NextRequest) {
  const business = await getOwnerBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form.", detail: parsed.error.flatten() }, { status: 400 });
  const updated = await prisma.business.update({ where: { id: business.id }, data: parsed.data });
  return NextResponse.json({ business: updated });
}

// WhatsApp connection fields used to live directly on Business; they moved
// to Location (a business can have multiple, each with its own WhatsApp
// number) — see app/api/locations/route.ts and app/api/locations/[id]/route.ts.
export async function GET() {
  const business = await getOwnerBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ business });
}
