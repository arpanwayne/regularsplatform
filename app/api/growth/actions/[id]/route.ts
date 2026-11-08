import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { executeAction } from "@/lib/growth/executor";
import { parseJson } from "@/lib/growth/settings";

const schema = z.object({
  decision: z.enum(["approve", "skip"]),
  /** Optional edit of the customer message / review reply before approving. */
  text: z.string().trim().min(5).max(600).optional(),
});

/** POST /api/growth/actions/:id — owner approves (and optionally edits) or skips one action. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const action = await prisma.growthAction.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action.status !== "PROPOSED") return NextResponse.json({ error: `Already ${action.status.toLowerCase()}` }, { status: 409 });

  if (parsed.data.decision === "skip") {
    await prisma.growthAction.update({ where: { id: action.id }, data: { status: "SKIPPED" } });
    return NextResponse.json({ status: "SKIPPED" });
  }
  const payload = parseJson<Record<string, unknown>>(action.payload, {});
  if (parsed.data.text) payload[action.type === "REVIEW_REPLY" ? "reply" : "message"] = parsed.data.text;
  await prisma.growthAction.update({ where: { id: action.id }, data: { status: "APPROVED", payload: JSON.stringify(payload) } });
  const result = await executeAction(action.id);
  return NextResponse.json(result);
}
