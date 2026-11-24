/**
 * Photos and videos for offers (Nov 2026).
 *
 * WhatsApp shows an offer's photo/video as the template header. Meta fetches
 * the file from a public https link, so uploads are served at
 * APP_URL/api/media/offers/<id>. Limits follow WhatsApp's own:
 *   image: JPEG or PNG, up to 5 MB
 *   video: MP4 (H.264 + AAC) or 3GPP, up to 16 MB
 *
 * Pure module (no Prisma) so the rules are unit-tested.
 */

export type MediaKind = "IMAGE" | "VIDEO";

export const MEDIA_RULES: Record<MediaKind, { types: string[]; maxBytes: number; label: string }> = {
  IMAGE: { types: ["image/jpeg", "image/png"], maxBytes: 5 * 1024 * 1024, label: "JPG or PNG photo up to 5 MB" },
  VIDEO: { types: ["video/mp4", "video/3gpp"], maxBytes: 16 * 1024 * 1024, label: "MP4 video up to 16 MB" },
};

/** Which kind a file is, or a plain-words problem. */
export function checkMedia(mimeType: string, size: number): { ok: true; kind: MediaKind } | { ok: false; error: string } {
  const type = (mimeType || "").toLowerCase().split(";")[0].trim();
  const kind = (Object.keys(MEDIA_RULES) as MediaKind[]).find((k) => MEDIA_RULES[k].types.includes(type));
  if (!kind) return { ok: false, error: "Use a JPG/PNG photo or an MP4 video (WhatsApp accepts only these)." };
  if (size <= 0) return { ok: false, error: "That file is empty." };
  const rule = MEDIA_RULES[kind];
  if (size > rule.maxBytes) return { ok: false, error: `That ${kind === "IMAGE" ? "photo" : "video"} is ${(size / 1024 / 1024).toFixed(1)} MB. WhatsApp allows a ${rule.label}.` };
  return { ok: true, kind };
}

/** Sniffs the first bytes, so a renamed file can't pretend to be a photo/video. */
export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  // ISO base media: "....ftyp<brand>"
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    return brand.startsWith("3g") ? "video/3gpp" : "video/mp4";
  }
  return null;
}

/** The public link WhatsApp fetches. Null when APP_URL isn't set (then offers go without the media). */
export function offerMediaUrl(id: string, appUrl = process.env.APP_URL): string | null {
  const base = (appUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) return null; // Meta only fetches https
  return `${base}/api/media/offers/${encodeURIComponent(id)}`;
}

/** Where owners make a promo video when they have no photo. */
export function adVideoStudioUrl(brief: string, base = process.env.NEXT_PUBLIC_AD_VIDEO_STUDIO_URL || "https://aivideo.wayneesolutions.com") {
  const b = brief.replace(/\s+/g, " ").trim().slice(0, 1500);
  return `${base.replace(/\/+$/, "")}/ads/new${b ? `?kind=video&brief=${encodeURIComponent(b)}` : "?kind=video"}`;
}
