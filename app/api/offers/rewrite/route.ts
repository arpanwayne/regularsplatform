import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentMember } from "@/lib/session";
import { allow } from "@/lib/rate-limit";
import { parseSegments } from "@/lib/offers";
import { rewriteOffer } from "@/lib/offer-ai";
import { businessLanguage } from "@/lib/whatsapp-send";

/** POST /api/offers/rewrite — AI turns the owner's rough offer into an engaging message (never inventing prices or dates). */
const schema = z.object({
  draft: z.string().trim().min(5).max(1000),
  title: z.string().trim().max(80).optional(),
  discountPercent: z.number().int().min(0).max(100).nullable().optional(),
  freebie: z.boolean().optional(),
  segments: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { business } = member;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write a few words about the offer first." }, { status: 400 });
  if (!(await allow(`offer-ai:${business.id}`, 60, 60 * 60 * 1000))) return NextResponse.json({ error: "That's a lot of rewrites this hour. Try again later." }, { status: 429 });
  const d = parsed.data;
  const r = await rewriteOffer(business.id, {
    businessName: business.name, sector: business.sector, language: await businessLanguage(business),
    draft: d.draft, title: d.title, discountPercent: d.discountPercent ?? null, freebie: !!d.freebie, segments: parseSegments(d.segments),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json({ title: r.title, message: r.message });
}
