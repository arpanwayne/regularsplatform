import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { createOffer, discountMismatch, mismatchText, parseSegments } from "@/lib/offers";

/**
 * POST /api/offers — the owner or a manager writes an offer. Inside the
 * owner's limits it is approved at once; otherwise the owner gets an
 * APPROVE / REJECT WhatsApp (lib/offers.ts).
 */
const schema = z.object({
  title: z.string().trim().min(1).max(80),
  message: z.string().trim().min(5).max(500),
  discountPercent: z.number().int().min(0).max(100).nullable().optional(),
  freebie: z.boolean().optional(),
  segments: z.array(z.string()).optional(),
  sendAt: z.string().datetime({ offset: true }).nullable().optional(),
  /** The owner saw the "message says 20% but discount is 10%" warning and saves anyway (B6). */
  confirmMismatch: z.boolean().optional(),
  /** From POST /api/offers/media. */
  mediaId: z.string().max(40).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { business, user } = member;
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "This account is suspended." }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the offer a title and a message (5–500 characters)." }, { status: 400 });
  const d = parsed.data;
  // B6 (28 Nov 2026): never promise a different discount than the label without asking.
  const wrong = discountMismatch(`${d.title} ${d.message}`, d.discountPercent);
  if (wrong.length && !d.confirmMismatch) {
    return NextResponse.json({ error: mismatchText(wrong, d.discountPercent!), code: "DISCOUNT_MISMATCH" }, { status: 409 });
  }
  const sendAt = d.sendAt ? new Date(d.sendAt) : null;
  if (sendAt && sendAt.getTime() > Date.now() + 60 * 24 * 60 * 60 * 1000) return NextResponse.json({ error: "Pick a send time within the next 60 days." }, { status: 400 });

  if (d.mediaId && !(await prisma.offerMedia.findFirst({ where: { id: d.mediaId, businessId: business.id }, select: { id: true } }))) {
    return NextResponse.json({ error: "That photo/video wasn't found. Upload it again." }, { status: 400 });
  }

  const r = await createOffer(business, user, {
    title: d.title, message: d.message, discountPercent: d.discountPercent || null, freebie: !!d.freebie,
    segments: parseSegments(d.segments), sendAt: sendAt && sendAt.getTime() > Date.now() ? sendAt : null,
    mediaId: d.mediaId || null,
  });
  return NextResponse.json({ offer: r.offer, auto: r.auto, reasons: r.reasons }, { status: 201 });
}
