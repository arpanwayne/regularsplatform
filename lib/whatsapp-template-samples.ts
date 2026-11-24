import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import type { HeaderSample } from "@/lib/whatsapp-template-sync";
import type { WaHeader } from "@/lib/whatsapp-templates";

/**
 * Sample files Meta's reviewers see for the photo/video offer templates.
 * Photo: our logo. Video: WHATSAPP_SAMPLE_VIDEO_PATH if set, otherwise the
 * most recent offer video uploaded on the platform.
 */
export async function headerSamples(withDb = true): Promise<Partial<Record<WaHeader, HeaderSample>>> {
  const out: Partial<Record<WaHeader, HeaderSample>> = {};
  const logo = await readFile(path.join(process.cwd(), "public/brand/logo.png")).catch(() => null);
  if (logo) out.IMAGE = { bytes: new Uint8Array(logo), mimeType: "image/png", fileName: "offer-sample.png" };

  const videoPath = process.env.WHATSAPP_SAMPLE_VIDEO_PATH;
  const file = videoPath ? await readFile(videoPath).catch(() => null) : null;
  if (file) out.VIDEO = { bytes: new Uint8Array(file), mimeType: "video/mp4", fileName: "offer-sample.mp4" };
  else if (withDb) {
    const v = await prisma.offerMedia.findFirst({ where: { kind: "VIDEO", mimeType: "video/mp4" }, orderBy: { createdAt: "desc" }, select: { data: true } });
    if (v) out.VIDEO = { bytes: new Uint8Array(v.data), mimeType: "video/mp4", fileName: "offer-sample.mp4" };
  }
  return out;
}
