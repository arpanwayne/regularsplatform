import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { logEvent } from "@/lib/logger";
import { normalizePhone } from "@/lib/phone";
import { graphSend, templateMessage } from "@/lib/whatsapp-send";
import { sharedSender, waErrorText, type WaSender } from "@/lib/whatsapp-sender";
import { WA_LANGS, WA_TEMPLATE_DEFS, renderTemplate, templateName, type WaLang, type WaTemplateKey } from "@/lib/whatsapp-templates";

/**
 * POST /api/admin/whatsapp-templates/test { key, lang, to, locationId? }
 * Sends one template, filled with its example values, to a test number —
 * so every template can be checked on a real phone before clients use it.
 * Sends from the shared number, or from a client's own number (locationId).
 * Nothing is saved as a customer message.
 */
const bodySchema = z.object({
  key: z.string(),
  lang: z.string(),
  to: z.string().trim().min(8).max(25),
  locationId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { key, lang, locationId } = parsed.data;

  const def = WA_TEMPLATE_DEFS.find((d) => d.key === key);
  if (!def || !(WA_LANGS as string[]).includes(lang) || !def.bodies[lang as WaLang]) {
    return NextResponse.json({ error: "Unknown template or language" }, { status: 400 });
  }
  // Numbers need the country code (+91…, +1…); a bare 10-digit number is read as Indian.
  const to = normalizePhone(parsed.data.to, "IN");
  if (!to) return NextResponse.json({ error: "Enter the test number with country code, e.g. +91 98765 43210" }, { status: 400 });

  let sender: WaSender | null;
  if (locationId) {
    const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { whatsappPhoneNumberId: true, whatsappAccessToken: true } });
    sender = loc?.whatsappPhoneNumberId && loc.whatsappAccessToken
      ? { phoneNumberId: loc.whatsappPhoneNumberId, accessToken: loc.whatsappAccessToken, shared: false }
      : null;
    if (!sender) return NextResponse.json({ error: "That location has no WhatsApp number connected." }, { status: 400 });
  } else {
    sender = sharedSender();
    if (!sender) return NextResponse.json({ error: "Set WHATSAPP_SHARED_PHONE_NUMBER_ID and WHATSAPP_SHARED_ACCESS_TOKEN on the server first." }, { status: 400 });
  }

  const l = lang as WaLang;
  const params = (def.examples[l] ?? def.examples.en).slice();
  const r = await graphSend(sender, to, templateMessage(key as WaTemplateKey, l, params));
  const name = templateName(key as WaTemplateKey, l);
  const masked = `+${to.slice(0, -4).replace(/\d/g, "•")}${to.slice(-4)}`;
  await logEvent({
    source: "WHATSAPP", level: r.ok ? "INFO" : "WARN",
    message: r.ok ? `Test template ${name} sent to ${masked}` : `Test template ${name} to ${masked} failed${r.code ? ` (Meta ${r.code})` : ""}`,
    meta: { template: name, category: def.category, messageId: r.id, error: r.error, code: r.code },
  });
  if (!r.ok) return NextResponse.json({ ok: false, error: waErrorText(r.code, r.error) }, { status: 502 });
  return NextResponse.json({ ok: true, messageId: r.id, category: def.category, preview: renderTemplate(key as WaTemplateKey, l, params) });
}
