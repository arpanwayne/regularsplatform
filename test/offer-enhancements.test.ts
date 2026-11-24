import { test } from "node:test";
import assert from "node:assert/strict";
import { adVideoStudioUrl, checkMedia, offerMediaUrl, sniffMime } from "../lib/offer-media";
import { cleanOfferText, inventedNumbers, parseJsonObject, rewritePrompt } from "../lib/offer-ai";
import { fallbackSuggestion, mergeSuggestions, summarizeSegments } from "../lib/segment-insights";
import { computeSegment } from "../lib/segmentation";
import { mediaHeader, offerSummary } from "../lib/offers";
import { templateMessage } from "../lib/whatsapp-send";
import { allMetaTemplates, getDef, templateName } from "../lib/whatsapp-templates";

const MB = 1024 * 1024;

test("offer photos/videos follow WhatsApp's limits", () => {
  assert.deepEqual(checkMedia("image/jpeg", 2 * MB), { ok: true, kind: "IMAGE" });
  assert.deepEqual(checkMedia("video/mp4", 15 * MB), { ok: true, kind: "VIDEO" });
  assert.equal(checkMedia("image/png", 6 * MB).ok, false);
  assert.equal(checkMedia("video/mp4", 17 * MB).ok, false);
  assert.equal(checkMedia("image/gif", 1000).ok, false);
  assert.equal(checkMedia("image/webp", 1000).ok, false);
  assert.equal(checkMedia("image/jpeg", 0).ok, false);
});

test("file type comes from the bytes, not the name", () => {
  assert.equal(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  assert.equal(sniffMime(mp4), "video/mp4");
  assert.equal(sniffMime(new TextEncoder().encode("<html>")), null);
});

test("WhatsApp gets an https link to the media, or none", () => {
  assert.equal(offerMediaUrl("abc123", "https://regulars.wayneesolutions.com/"), "https://regulars.wayneesolutions.com/api/media/offers/abc123");
  assert.equal(offerMediaUrl("abc123", "http://localhost:3000"), null);
  assert.equal(offerMediaUrl("abc123", ""), null);
  assert.deepEqual(mediaHeader({ id: "m1", kind: "VIDEO" }, "https://x.com"), { kind: "VIDEO", link: "https://x.com/api/media/offers/m1" });
  assert.equal(mediaHeader(null, "https://x.com"), null);
  assert.equal(mediaHeader({ id: "m1", kind: "IMAGE" }, ""), null);
});

test("Ad Video Studio opens with the offer as the brief", () => {
  const u = new URL(adVideoStudioUrl("Weekend spa. 20% off\nSat & Sun", "https://aivideo.wayneesolutions.com/"));
  assert.equal(u.pathname, "/ads/new");
  assert.equal(u.searchParams.get("kind"), "video");
  assert.equal(u.searchParams.get("brief"), "Weekend spa. 20% off Sat & Sun");
  assert.equal(new URL(adVideoStudioUrl("", "https://a.com")).search, "?kind=video");
});

test("photo/video offer templates: same body, a media header", () => {
  assert.equal(getDef("offer_image").header, "IMAGE");
  assert.equal(getDef("offer_video").header, "VIDEO");
  assert.equal(getDef("offer_image").bodies.en, getDef("offer").bodies.en);
  assert.equal(templateName("offer_image", "hinglish"), "loopdesk_offer_image_hinglish");
  const t = allMetaTemplates().find((x) => x.name === "loopdesk_offer_video" && x.language === "en")!;
  assert.equal(t.components[0].type, "BODY");
  assert.deepEqual(t.components[1], { type: "HEADER", format: "VIDEO" });
  assert.equal(allMetaTemplates().find((x) => x.name === "loopdesk_offer")!.components.length, 1);

  const m = templateMessage("offer_image", "en", ["Priya", "Glow", "20% off"], undefined, { kind: "IMAGE", link: "https://x.com/p.jpg" }) as { template: { components: Array<Record<string, unknown>> } };
  assert.deepEqual(m.template.components[0], { type: "header", parameters: [{ type: "image", image: { link: "https://x.com/p.jpg" } }] });
  assert.equal(m.template.components[1].type, "body");
  const plain = templateMessage("offer", "en", ["a", "b", "c"]) as { template: { components: unknown[] } };
  assert.equal(plain.template.components.length, 1);
});

test("the owner's approval line says when an offer has a photo/video", () => {
  assert.match(offerSummary({ title: "Spa", message: "20% off", discountPercent: 20, freebie: false, mediaKind: "VIDEO" }), /Spa \(20% off, with a video\)/);
});

test("AI rewrites may not invent prices, discounts or dates", () => {
  assert.deepEqual(inventedNumbers("Get 20% off, only ₹1,499 till 30 Nov!", "spa 20% off for 1499 till 30 nov"), []);
  assert.deepEqual(inventedNumbers("Get 25% off this week", "spa 20% off", 20), ["25"]);
  assert.deepEqual(inventedNumbers("Flat 15% off", "spa offer", 15), []); // from the discount field
  assert.deepEqual(inventedNumbers("Valid until 31 Dec", "haircut deal"), ["31"]);
});

test("AI text becomes one WhatsApp-safe line without its own STOP line", () => {
  assert.equal(cleanOfferText('"Big sale!\n\nCome soon."'), "Big sale! Come soon.");
  assert.equal(cleanOfferText("Hair spa 20% off. Reply STOP to opt out"), "Hair spa 20% off.");
  const long = cleanOfferText("word ".repeat(200));
  assert.ok(long.length <= 480 && long.endsWith("…"));
  assert.deepEqual(parseJsonObject('Sure! {"title":"A","message":"B"} hope it helps'), { title: "A", message: "B" });
  assert.equal(parseJsonObject("no json"), null);
});

test("the rewrite prompt carries the real details and the rules", () => {
  const p = rewritePrompt({ businessName: "Glow Salon", sector: "SALON", language: "hinglish", draft: "hair spa 20% off sat sun", discountPercent: 20, segments: ["AT_RISK"] });
  assert.match(p, /Glow Salon/);
  assert.match(p, /Hinglish/);
  assert.match(p, /hair spa 20% off sat sun/);
  assert.match(p, /haven't for a few weeks/);
  assert.match(p, /Do NOT invent/);
});

test("one-time customers who never came back are at-risk, not new", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86400000);
  assert.equal(computeSegment({ visitCount: 1, totalSpend: 0, lastSeenAt: ago(45), firstSeenAt: ago(45) }, null, undefined, now), "AT_RISK");
  assert.equal(computeSegment({ visitCount: 1, totalSpend: 0, lastSeenAt: ago(5), firstSeenAt: ago(5) }, null, undefined, now), "NEW");
  assert.equal(computeSegment({ visitCount: 5, totalSpend: 0, lastSeenAt: ago(10), firstSeenAt: ago(200) }, null, undefined, now), "REGULAR");
  assert.equal(computeSegment({ visitCount: 1, totalSpend: 0, lastSeenAt: ago(90), firstSeenAt: ago(90) }, null, undefined, now), "DORMANT");
});

test("segment summaries are computed from visits, spend and messages", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86400000);
  const rows = [
    { segment: "REGULAR", visitCount: 6, totalSpend: 3000, lastSeenAt: ago(2), firstSeenAt: ago(100), inbound30d: 3 },
    { segment: "REGULAR", visitCount: 4, totalSpend: 1000, lastSeenAt: ago(6), firstSeenAt: ago(80), inbound30d: 0 },
    { segment: "DORMANT", visitCount: 2, totalSpend: 500, lastSeenAt: ago(90), firstSeenAt: ago(200), inbound30d: 0 },
  ];
  const s = summarizeSegments(rows, now);
  assert.deepEqual(s.map((x) => x.segment), ["NEW", "REGULAR", "AT_RISK", "HIGH_SPENDER", "DORMANT"]);
  const reg = s.find((x) => x.segment === "REGULAR")!;
  assert.deepEqual({ count: reg.count, avgSpend: reg.avgSpend, avgVisits: reg.avgVisits, median: reg.medianDaysSinceVisit, engaged: reg.engagedShare }, { count: 2, avgSpend: 2000, avgVisits: 5, median: 4, engaged: 0.5 });
  assert.equal(s.find((x) => x.segment === "NEW")!.count, 0);
  assert.equal(s.find((x) => x.segment === "NEW")!.medianDaysSinceVisit, null);
});

test("offer ideas: AI ideas are checked, clinics get no discounts", () => {
  assert.equal(fallbackSuggestion("DORMANT", "SALON").discountPercent, 20);
  assert.equal(fallbackSuggestion("DORMANT", "CLINIC").discountPercent, null);
  assert.equal(fallbackSuggestion("HIGH_SPENDER", "SALON").discountPercent, null);

  const m = mergeSuggestions({
    AT_RISK: { title: "Miss you", message: "Come back this week for 15% off your next visit", discountPercent: 15, why: "Lapsing." },
    DORMANT: { title: "Back", message: "Only ₹299 for a haircut till Sunday", discountPercent: 10, why: "x" }, // invented price
    NEW: { title: "Hi", message: "Second visit 50% off", discountPercent: 50, why: "x" }, // too big, and 50 isn't allowed
  }, "SALON");
  assert.equal(m.AT_RISK.ai, true);
  assert.equal(m.AT_RISK.discountPercent, 15);
  assert.equal(m.DORMANT.ai, false);
  assert.equal(m.NEW.ai, false);
  assert.equal(m.REGULAR.ai, false);
  assert.equal(mergeSuggestions({ AT_RISK: { title: "t", message: "Come back for 15% off your next visit", discountPercent: 15, why: "w" } }, "CLINIC").AT_RISK.ai, false);
});
