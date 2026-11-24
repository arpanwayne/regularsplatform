import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/media/offers/:id — an offer's photo/video. Public on purpose:
 * WhatsApp (Meta) downloads it from here to show it above the offer, and
 * customers see it anyway. The id is a random cuid, so files can't be listed.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[a-z0-9]{10,40}$/i.test(params.id)) return new NextResponse("Not found", { status: 404 });
  const m = await prisma.offerMedia.findUnique({ where: { id: params.id }, select: { mimeType: true, size: true, data: true } });
  if (!m) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(m.data), {
    headers: {
      "content-type": m.mimeType,
      "content-length": String(m.size),
      "cache-control": "public, max-age=604800, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
