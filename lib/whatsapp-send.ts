import type { Business, Customer, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { senderName, type SendResult } from "@/lib/sms";
import type { MessagePurpose } from "@/lib/types";
import {
  fallbackName, metaLanguage, nextStep, renderTemplate, resolveLang, sanitizeParam, templateName,
  type WaLang, type WaTemplateKey,
} from "@/lib/whatsapp-templates";
import { whatsappSenderFor, windowOpen, type WaSender } from "@/lib/whatsapp-sender";

/**
 * Outgoing WhatsApp (Cloud API). Every business-started message uses an
 * approved template from lib/whatsapp-templates.ts; inside the 24-hour
 * window after the person's last message we send plain text instead
 * (so inbox replies and AI-written copy go out as written).
 */

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v21.0"}`;

type GraphResult = { ok: boolean; id: string | null; error?: string; code?: number };

export async function graphSend(sender: WaSender, to: string, message: Record<string, unknown>): Promise<GraphResult> {
  try {
    const res = await fetch(`${GRAPH}/${sender.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${sender.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/\D/g, ""), ...message }),
    });
    const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    const id = data.messages?.[0]?.id ?? null;
    return res.ok && id ? { ok: true, id } : { ok: false, id: null, error: data.error?.message ?? `HTTP ${res.status}`, code: data.error?.code };
  } catch (err) {
    return { ok: false, id: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export const templateMessage = (key: WaTemplateKey, lang: WaLang, params: string[]) => ({
  type: "template",
  template: {
    name: templateName(key, lang),
    language: { code: metaLanguage(lang) },
    components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: sanitizeParam(p) })) }],
  },
});

export const textMessage = (body: string) => ({ type: "text", text: { preview_url: true, body: body.slice(0, 4096) } });

/** The language the business writes to customers in (Growth settings). */
export async function businessLanguage(business: Pick<Business, "id" | "country">): Promise<string> {
  const s = await prisma.growthSettings.findUnique({ where: { businessId: business.id }, select: { messageLanguage: true } });
  return s?.messageLanguage ?? (business.country === "IN" ? "hinglish" : "en");
}

/** When the customer last wrote to us on WhatsApp (opens the 24h free-text window). */
export async function lastInboundWhatsApp(customerId: string) {
  const m = await prisma.message.findFirst({
    where: { customerId, channel: "WHATSAPP", direction: "INBOUND" },
    orderBy: { createdAt: "desc" }, select: { createdAt: true },
  });
  return m?.createdAt ?? null;
}

/** The standard [first name, business name, next step / review link] values for a customer template. */
export function customerParams(key: WaTemplateKey, lang: WaLang, customer: Pick<Customer, "name">, location: Location, business: Pick<Business, "name">) {
  const first = (customer.name ?? "").trim().split(/\s+/)[0] || fallbackName(lang);
  const third = key === "review_request" ? location.googleReviewUrl ?? "" : nextStep(lang, location.bookingUrl);
  return [first, senderName(location, business), third];
}

export function canSendWhatsApp(business: Business, location: Location | null | undefined) {
  return !!whatsappSenderFor(location, business);
}

/**
 * Sends one WhatsApp message to a customer. Returns null when this location
 * has no WhatsApp sender at all (caller falls back to SMS).
 *
 *  - window open and `text` given → that text, as written
 *  - otherwise → the approved template `templateKey`
 *  - no template and window closed → NOT_SENT (WhatsApp would refuse it)
 */
export async function sendCustomerWhatsApp(p: {
  business: Business; location: Location; customer: Customer; purpose: MessagePurpose;
  templateKey?: WaTemplateKey; params?: string[]; text?: string; now?: Date;
}): Promise<SendResult | null> {
  const { business, location, customer, purpose } = p;
  const sender = whatsappSenderFor(location, business);
  if (!sender) return null;
  if (business.status === "SUSPENDED" || location.status === "SUSPENDED") return { ok: false, status: "SUSPENDED" };
  if (customer.optedOut) return { ok: false, status: "OPTED_OUT" };

  const open = windowOpen(await lastInboundWhatsApp(customer.id), p.now);
  let message: Record<string, unknown>, shown: string, tpl: string | null = null;
  if (p.text && open) {
    message = textMessage(p.text);
    shown = p.text;
  } else if (p.templateKey) {
    const lang = resolveLang(p.templateKey, await businessLanguage(business));
    const params = p.params ?? customerParams(p.templateKey, lang, customer, location, business);
    message = templateMessage(p.templateKey, lang, params);
    shown = renderTemplate(p.templateKey, lang, params);
    tpl = templateName(p.templateKey, lang);
  } else {
    return { ok: false, status: "FAILED", error: "WINDOW_CLOSED: WhatsApp only allows a free reply within 24 hours of the customer's last message." };
  }

  const r = await graphSend(sender, customer.phone, message);
  const msg = await prisma.message.create({
    data: {
      businessId: business.id, locationId: location.id, customerId: customer.id,
      direction: "OUTBOUND", channel: "WHATSAPP", purpose, status: r.ok ? "SENT" : "FAILED",
      providerSid: r.id, text: shown,
      rawPayload: JSON.stringify({ template: tpl, shared: sender.shared, error: r.error ?? null }),
    },
  });
  if (r.ok) {
    await prisma.usageEvent.create({ data: { businessId: business.id, type: "WHATSAPP_SENT" } });
    return { ok: true, status: "SENT", messageId: msg.id, segments: 0 };
  }
  await logEvent({ businessId: business.id, source: "WHATSAPP", level: "ERROR", message: "WhatsApp send failed", meta: { customerId: customer.id, purpose, template: tpl, error: r.error, code: r.code } });
  return { ok: false, status: "FAILED", error: r.error };
}

/** Meta error when free text is sent outside the 24h window. */
const RE_ENGAGEMENT = 131047;

/**
 * Message to the business owner on WhatsApp. Tries `text` first (works when
 * the owner wrote to us in the last 24h, e.g. right after replying to the
 * brief); if WhatsApp refuses it and a template is given, sends that.
 */
export async function sendOwnerWhatsApp(
  business: Business, location: Location | null | undefined, to: string,
  msg: { text?: string; templateKey?: WaTemplateKey; params?: string[] },
): Promise<boolean> {
  const sender = whatsappSenderFor(location, business);
  if (!sender) return false;
  let r: GraphResult | null = null;
  if (msg.text) r = await graphSend(sender, to, textMessage(msg.text));
  if ((!r || (!r.ok && (r.code === RE_ENGAGEMENT || !msg.text))) && msg.templateKey) {
    const lang = resolveLang(msg.templateKey, await businessLanguage(business));
    r = await graphSend(sender, to, templateMessage(msg.templateKey, lang, msg.params ?? []));
  }
  if (r?.ok) {
    await prisma.usageEvent.create({ data: { businessId: business.id, type: "WHATSAPP_SENT" } });
    return true;
  }
  await logEvent({ businessId: business.id, source: "WHATSAPP", level: "ERROR", message: "Owner WhatsApp message failed", meta: { error: r?.error, code: r?.code } });
  return false;
}

/** WhatsApp messages sent this calendar month (UTC). */
export async function whatsappUsageThisMonth(businessId: string, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return prisma.usageEvent.count({ where: { businessId, type: "WHATSAPP_SENT", createdAt: { gte: start } } });
}
