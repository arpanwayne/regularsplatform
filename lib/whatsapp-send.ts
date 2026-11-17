import type { Business, Customer, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { senderName, type SendResult } from "@/lib/sms";
import type { MessagePurpose } from "@/lib/types";
import {
  fallbackName, getDef, legacyTemplateName, metaLanguage, nextStep, renderTemplate, resolveLang, sanitizeParam, templateName, WA_LANGS, WA_TEMPLATE_DEFS,
  type WaLang, type WaTemplateKey,
} from "@/lib/whatsapp-templates";
import { sharedSender, whatsappSenderFor, windowOpen, type WaSender } from "@/lib/whatsapp-sender";
import { isInstagramOnly } from "@/lib/instagram-shared";

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

export const templateMessage = (key: WaTemplateKey, lang: WaLang, params: string[], name = templateName(key, lang)) => ({
  type: "template",
  template: {
    name,
    language: { code: metaLanguage(lang) },
    components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: sanitizeParam(p) })) }],
  },
});

/** Meta: the template (in this language) doesn't exist, isn't approved yet, or is paused/disabled. */
export const TEMPLATE_MISSING_CODES = [132001, 132015, 132016];

/**
 * Sends a template, and if Meta says that name/language isn't usable yet
 * (e.g. a new "_v2" or a Hindi version still in review) tries the older
 * approved name, then English. Returns what was actually sent.
 */
export async function sendTemplateWithFallback(sender: WaSender, to: string, key: WaTemplateKey, lang: WaLang, params: string[] | ((l: WaLang) => string[])) {
  const paramsFor = (l: WaLang) => (typeof params === "function" ? params(l) : params);
  const tries: Array<{ lang: WaLang; name: string }> = [{ lang, name: templateName(key, lang) }];
  const legacy = legacyTemplateName(key, lang);
  if (legacy) tries.push({ lang, name: legacy });
  if (lang !== "en") {
    tries.push({ lang: "en", name: templateName(key, "en") });
    const legacyEn = legacyTemplateName(key, "en");
    if (legacyEn) tries.push({ lang: "en", name: legacyEn });
  }
  let r: GraphResult = { ok: false, id: null, error: "not sent" };
  for (const t of tries) {
    r = await graphSend(sender, to, templateMessage(key, t.lang, paramsFor(t.lang), t.name));
    if (r.ok || !TEMPLATE_MISSING_CODES.includes(r.code ?? 0)) return { ...r, lang: t.lang, name: t.name };
  }
  return { ...r, lang: tries[tries.length - 1].lang, name: tries[tries.length - 1].name };
}

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

/** Names of every MARKETING-category template (all languages). */
export function marketingTemplateNames() {
  const names = new Set<string>();
  for (const d of WA_TEMPLATE_DEFS) {
    if (d.category !== "MARKETING") continue;
    for (const l of WA_LANGS) {
      if (!d.bodies[l]) continue;
      names.add(templateName(d.key, l));
      const legacy = legacyTemplateName(d.key, l);
      if (legacy) names.add(legacy);
    }
  }
  return names;
}

/** Max marketing templates one customer gets from us in 24 hours (Meta 131049 guard). */
export const MARKETING_PER_DAY = Number(process.env.WHATSAPP_MARKETING_PER_DAY || 1);

/** True when this customer already got MARKETING_PER_DAY marketing templates in the last 24 hours. */
export async function marketingLimitReached(customerId: string, now = new Date()) {
  const recent = await prisma.message.findMany({
    where: { customerId, channel: "WHATSAPP", direction: "OUTBOUND", status: { not: "FAILED" }, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    select: { rawPayload: true },
  });
  const names = marketingTemplateNames();
  const count = recent.filter((m) => {
    try { return names.has(String(JSON.parse(m.rawPayload ?? "{}").template ?? "")); } catch { return false; }
  }).length;
  return count >= MARKETING_PER_DAY;
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
  // Someone who only wrote on Instagram has no WhatsApp number.
  if (isInstagramOnly(customer)) return { ok: false, status: "NO_NUMBER", error: "NO_PHONE: This customer has only messaged on Instagram — there is no WhatsApp number." };

  const open = windowOpen(await lastInboundWhatsApp(customer.id), p.now);
  let r: GraphResult, shown: string, tpl: string | null = null, sentLang: WaLang | null = null;
  if (p.text && open) {
    r = await graphSend(sender, customer.phone, textMessage(p.text));
    shown = p.text;
  } else if (p.templateKey) {
    if (getDef(p.templateKey).category === "MARKETING" && (await marketingLimitReached(customer.id, p.now))) {
      return { ok: false, status: "FAILED", error: `DAILY_LIMIT: This customer already got a marketing message in the last 24 hours. WhatsApp blocks more (Meta 131049), so this one waits.` };
    }
    const key = p.templateKey;
    const lang = resolveLang(key, await businessLanguage(business));
    const paramsFor = (l: WaLang) => p.params ?? customerParams(key, l, customer, location, business);
    const t = await sendTemplateWithFallback(sender, customer.phone, key, lang, paramsFor);
    r = t;
    sentLang = t.lang;
    tpl = t.name;
    shown = renderTemplate(key, t.lang, paramsFor(t.lang));
  } else {
    return { ok: false, status: "FAILED", error: "WINDOW_CLOSED: WhatsApp only allows a free reply within 24 hours of the customer's last message." };
  }

  const msg = await prisma.message.create({
    data: {
      businessId: business.id, locationId: location.id, customerId: customer.id,
      direction: "OUTBOUND", channel: "WHATSAPP", purpose, status: r.ok ? "SENT" : "FAILED",
      providerSid: r.id, text: shown,
      // lang is kept so "which language did this go in?" has an answer (bug B6).
      rawPayload: JSON.stringify({ template: tpl, lang: sentLang, shared: sender.shared, error: r.error ?? null, errorCode: r.code ?? null }),
    },
  });
  if (r.ok) {
    await prisma.usageEvent.create({ data: { businessId: business.id, type: "WHATSAPP_SENT" } });
    return { ok: true, status: "SENT", messageId: msg.id, segments: 0 };
  }
  await logEvent({ businessId: business.id, source: "WHATSAPP", level: "ERROR", message: "WhatsApp send failed", meta: { customerId: customer.id, purpose, template: tpl, error: r.error, code: r.code } });
  return { ok: false, status: "FAILED", error: r.error };
}

/**
 * The WhatsApp number that writes to a business OWNER. Same as for customers
 * (own number, or the shared number in shared countries), plus: owners in
 * any country may get their brief from the shared number, because the owner
 * is our client, not a marketing contact. This is what lets a Canadian
 * business without a texting number still get its morning plan (bug B2).
 * Set WHATSAPP_OWNER_ANY_COUNTRY=false to switch that off.
 */
export function ownerWhatsAppSender(location: Location | null | undefined, business: Pick<Business, "country">): WaSender | null {
  return whatsappSenderFor(location, business) ?? (process.env.WHATSAPP_OWNER_ANY_COUNTRY === "false" ? null : sharedSender());
}

/**
 * Message to the business owner on WhatsApp.
 *
 * With a template: the template is sent. (It used to try free text first,
 * but Meta ACCEPTS free text outside the 24h window and only reports the
 * 131047 failure later on the status webhook — so the template was never
 * sent and the morning brief silently never arrived, bug B2.)
 * Without a template (the "Approved 2 actions" confirmation right after the
 * owner wrote to us): plain text, which is inside the window.
 */
export async function sendOwnerWhatsApp(
  business: Business, location: Location | null | undefined, to: string,
  msg: { text?: string; templateKey?: WaTemplateKey; params?: string[] },
): Promise<boolean> {
  const sender = ownerWhatsAppSender(location, business);
  if (!sender) return false;
  let r: GraphResult | null = null;
  if (msg.templateKey) {
    const lang = resolveLang(msg.templateKey, await businessLanguage(business));
    r = await sendTemplateWithFallback(sender, to, msg.templateKey, lang, msg.params ?? []);
  } else if (msg.text) {
    r = await graphSend(sender, to, textMessage(msg.text));
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
