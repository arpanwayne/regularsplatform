import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { allow } from "@/lib/rate-limit";
import { checkMedia, offerMediaUrl, sniffMime } from "@/lib/offer-media";

/**
 * POST /api/offers/media  (multipart, field "file") — the owner or a manager
 * uploads a photo or video for an offer. Returns its id; the offer form sends
 * that id with the offer (POST /api/offers { mediaId }).
 *
 * Behind Nginx, raise its upload limit or videos fail with 413:
 *   client_max_body_size 20m;
 */
export async function POST(req: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { business } = member;
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "This account is suspended." }, { status: 403 });
  if (!(await allow(`offer-media:${business.id}`, 30, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many uploads this hour. Try again later." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose a photo or video first." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Trust the file's own bytes over the name/type the browser reports.
  const mime = sniffMime(bytes) ?? file.type;
  const check = checkMedia(mime, bytes.length);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const media = await prisma.offerMedia.create({
    data: { businessId: business.id, kind: check.kind, mimeType: mime, size: bytes.length, data: Buffer.from(bytes) },
    select: { id: true, kind: true, mimeType: true, size: true },
  });
  return NextResponse.json({
    media,
    previewUrl: `/api/media/offers/${media.id}`,
    // Without a public https APP_URL, WhatsApp can't fetch the file: the offer still goes, as text.
    warning: offerMediaUrl(media.id) ? null : "APP_URL isn't set to an https address on the server, so WhatsApp can't show this file yet. The offer will go as text until it is.",
  }, { status: 201 });
}
