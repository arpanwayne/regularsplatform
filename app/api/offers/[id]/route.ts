import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { decideOffer } from "@/lib/offers";

/**
 * PATCH /api/offers/:id  { action: "approve" | "reject" | "cancel" }
 * approve / reject: the owner, from the dashboard (same as replying on WhatsApp).
 * cancel: the owner, or the manager who wrote it, before it is sent.
 */
const schema = z.object({ action: z.enum(["approve", "reject", "cancel"]) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const { business, user, isOwner } = member;
  const offer = await prisma.offer.findFirst({ where: { id: params.id, businessId: business.id } });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  if (parsed.data.action === "cancel") {
    if (!isOwner && offer.createdById !== user.id) return NextResponse.json({ error: "Only the owner or whoever wrote it can cancel this offer." }, { status: 403 });
    const r = await prisma.offer.updateMany({ where: { id: offer.id, status: { in: ["PENDING_APPROVAL", "APPROVED"] } }, data: { status: "CANCELLED", decidedAt: new Date() } });
    if (!r.count) return NextResponse.json({ error: "This offer can't be cancelled any more." }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  if (!isOwner) return NextResponse.json({ error: "Only the owner can approve or reject offers." }, { status: 403 });
  const r = await decideOffer(business, offer.id, parsed.data.action === "approve" ? "APPROVE" : "REJECT", "DASHBOARD");
  if (!r.changed) return NextResponse.json({ error: "This offer isn't waiting for approval any more." }, { status: 409 });
  return NextResponse.json({ offer: r.offer });
}
