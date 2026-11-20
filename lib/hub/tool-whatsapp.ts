import type { Business, Location } from "@prisma/client";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { bundleLive, type Tool } from "@/lib/hub/plans";
import { businessTools } from "@/lib/hub/catalog-rules";
import { signHubToken, toolSecret, toolUrl } from "@/lib/hub/tokens";
import { graphSend } from "@/lib/whatsapp-send";
import { whatsappSenderFor, type WaSender } from "@/lib/whatsapp-sender";

/**
 * Bundle rule 4 (Nov 2026): one client = one WhatsApp number, and it lives
 * here in Regulars. Tools that talk to people on WhatsApp (today: Loyvexa,
 * its dealer / mechanic bot, OTPs, scheme messages, campaigns) don't keep a
 * number of their own:
 *
 *   tool → hub   POST /api/hub/tools/loyvexa/whatsapp/send
 *                Bearer HS256 JWT signed with HUB_SECRET_<TOOL>:
 *                iss <tool audience> ("loyvexa")  aud "regulars-hub"
 *                sub <Regulars business id>  purpose "whatsapp-send"  jti  exp ≤ 2 min
 *                body { to, message }  (message = WhatsApp Cloud API payload, type text | template)
 *                → { messageId }
 *
 *   hub → tool   POST {LOYVEXA_API_URL}/api/hub/whatsapp/inbound
 *                Bearer hub token, purpose "whatsapp-inbound"
 *                { messages: [{ from, text, id }], statuses: [{ id, status, error }] }
 *
 * The number used is the business's usual one (its own, else the shared
 * Loopdesk number). People a tool has written to are remembered in
 * HubWaContact, so their replies go back to that tool instead of the
 * Regulars inbox, and on the shared number they route to the right business.
 */

/** Tools that may send WhatsApp through the hub. */
export const WA_TOOLS: Partial<Record<string, Tool>> = { loyvexa: "LOYVEXA" };
const TOOL_ISSUER: Partial<Record<Tool, string>> = { LOYVEXA: "loyvexa" };

export class ToolWaError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Digits only: "+91 98140-00101" → "919814000101". */
export const waDigits = (s: string) => String(s ?? "").replace(/\D/g, "");

/**
 * Checks the payload a tool asks us to send. Only plain text and approved
 * templates; nothing that could address someone else or change the sender.
 */
export function checkToolMessage(body: unknown): { to: string; message: Record<string, unknown>; kind: "text" | "template"; templateName: string | null } {
  const b = (body ?? {}) as { to?: unknown; message?: Record<string, unknown> };
  const to = waDigits(String(b.to ?? ""));
  if (to.length < 10 || to.length > 15) throw new ToolWaError(400, "BAD_NUMBER", "to must be a mobile number with country code");
  const m = b.message;
  if (!m || typeof m !== "object") throw new ToolWaError(400, "BAD_MESSAGE", "message is required");
  if (m.type === "text") {
    const text = (m.text as { body?: unknown } | undefined)?.body;
    if (typeof text !== "string" || !text.trim()) throw new ToolWaError(400, "BAD_MESSAGE", "text.body is required");
    return { to, kind: "text", templateName: null, message: { type: "text", text: { preview_url: true, body: text.slice(0, 4096) } } };
  }
  if (m.type === "template") {
    const t = (m.template ?? {}) as { name?: unknown; language?: { code?: unknown }; components?: unknown };
    if (typeof t.name !== "string" || !/^[a-z0-9_]{1,512}$/.test(t.name)) throw new ToolWaError(400, "BAD_TEMPLATE", "template.name must be a Meta template name");
    const code = typeof t.language?.code === "string" ? t.language.code : "en";
    const components = Array.isArray(t.components) ? t.components : [];
    return { to, kind: "template", templateName: t.name, message: { type: "template", template: { name: t.name, language: { code }, components } } };
  }
  throw new ToolWaError(400, "BAD_MESSAGE", "message.type must be text or template");
}

/** OTPs still go to people who sent STOP (they asked for the code); nothing else does. */
export const isOtpTemplate = (name: string | null) => !!name && /(^|_)otp($|_)/.test(name);

/** Single use for tool tokens (2-minute tokens; the row is just a marker). */
async function burnJti(jti: string) {
  try {
    await prisma.rateLimit.create({ data: { key: `hubjti:${jti}`, count: 1, resetAt: new Date(Date.now() + 10 * 60_000) } });
  } catch {
    throw new ToolWaError(401, "TOKEN_USED", "Hub token already used");
  }
  prisma.rateLimit.deleteMany({ where: { key: { startsWith: "hubjti:" }, resetAt: { lt: new Date() } } }).catch(() => {});
}

/** Verifies a tool → hub token and returns the business it is for. */
export async function verifyToolToken(tool: Tool, authorization: string | null, purpose: string) {
  const secret = toolSecret(tool);
  if (!secret) throw new ToolWaError(503, "HUB_DISABLED", "Hub secret for this tool is not set");
  const token = (authorization ?? "").startsWith("Bearer ") ? authorization!.slice(7) : "";
  if (!token) throw new ToolWaError(401, "UNAUTHORIZED", "Missing token");
  let claims: Record<string, unknown>;
  try {
    ({ payload: claims } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], issuer: TOOL_ISSUER[tool], audience: "regulars-hub", maxTokenAge: "3m",
    }));
  } catch {
    throw new ToolWaError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
  if (claims.purpose !== purpose || typeof claims.sub !== "string" || typeof claims.jti !== "string") throw new ToolWaError(401, "UNAUTHORIZED", "Wrong token");
  await burnJti(claims.jti);
  return claims.sub;
}

/** The business, its sending location and number, if the tool is live for it. */
async function senderForTool(businessId: string, tool: Tool): Promise<{ business: Business; location: Location; sender: WaSender }> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { locations: { orderBy: { createdAt: "asc" } } } });
  if (!business) throw new ToolWaError(404, "NOT_FOUND", "Business not found");
  if (business.status === "SUSPENDED" || !bundleLive(business) || !businessTools(business).includes(tool)) {
    throw new ToolWaError(403, "NOT_IN_PLAN", "This tool is not active in the business's bundle");
  }
  // The location with its own number first, else the first one (shared number).
  const location = business.locations.find((l) => l.whatsappPhoneNumberId && l.whatsappAccessToken) ?? business.locations[0];
  const sender = location ? whatsappSenderFor(location, business) : null;
  if (!location || !sender) throw new ToolWaError(409, "NO_WHATSAPP", "This business has no WhatsApp number set up in Regulars Settings");
  return { business, location, sender };
}

/** Send for a tool. Returns Meta's message id. */
export async function sendForTool(tool: Tool, businessId: string, body: unknown): Promise<{ messageId: string }> {
  const msg = checkToolMessage(body);
  const { business, location, sender } = await senderForTool(businessId, tool);
  // Same STOP list everywhere: someone who opted out of this business here gets nothing but OTPs.
  if (!isOtpTemplate(msg.templateName)) {
    const out = await prisma.customer.findFirst({ where: { businessId: business.id, phone: { in: [msg.to, `+${msg.to}`] }, optedOut: true }, select: { id: true } });
    if (out) throw new ToolWaError(409, "OPTED_OUT", "This person sent STOP to the business");
  }
  const r = await graphSend(sender, msg.to, msg.message);
  if (!r.ok || !r.id) {
    await logEvent({ businessId: business.id, source: "WHATSAPP", level: "WARN", message: `${tool} WhatsApp not sent`, meta: { error: r.error, code: r.code } });
    throw new ToolWaError(502, "WHATSAPP_FAILED", r.error ?? "WhatsApp send failed");
  }
  const now = new Date();
  await prisma.hubWaContact.upsert({
    where: { businessId_tool_phone: { businessId: business.id, tool, phone: msg.to } },
    create: { businessId: business.id, tool, phone: msg.to, locationId: sender.shared ? null : location.id, lastOutboundAt: now },
    update: { lastOutboundAt: now, locationId: sender.shared ? null : location.id },
  });
  await prisma.hubWaMessage.create({ data: { providerSid: r.id, businessId: business.id, tool } }).catch(() => {});
  prisma.hubWaMessage.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 14 * 864e5) } } }).catch(() => {});
  return { messageId: r.id };
}

/**
 * Shared number: the tool contact that last heard from a business (any business
 * on the shared number), or null. Used next to Regulars' own "last outbound".
 */
export async function latestSharedToolContact(phone: string) {
  return prisma.hubWaContact.findFirst({
    where: { phone: waDigits(phone), locationId: null, lastOutboundAt: { not: null } },
    orderBy: { lastOutboundAt: "desc" },
  });
}


async function postToTool(tool: Tool, businessId: string, body: unknown) {
  const api = toolUrl(tool, "api");
  if (!api || !toolSecret(tool)) throw new Error(`${tool} API URL or hub secret not set`);
  const token = await signHubToken(tool, "whatsapp-inbound", businessId);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${api}/api/hub/whatsapp/inbound`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** A message from one of the tool's people → the tool (its bot answers through sendForTool). */
export async function forwardInbound(tool: Tool, businessId: string, m: { from: string; text: string | null; id: string }) {
  const phone = waDigits(m.from);
  await prisma.hubWaContact.updateMany({ where: { businessId, tool, phone }, data: { lastInboundAt: new Date() } });
  try {
    await postToTool(tool, businessId, { messages: [{ from: phone, text: m.text, id: m.id }] });
  } catch (err) {
    await logEvent({ businessId, source: "WHATSAPP", level: "ERROR", message: `Could not pass a WhatsApp message on to ${tool}`, meta: { error: err instanceof Error ? err.message : String(err) } });
  }
}

/** Meta receipts for messages a tool sent → that tool. */
export async function forwardStatuses(statuses: { id: string; status: string; errors?: { title?: string }[] }[]) {
  if (!statuses.length) return;
  const rows = await prisma.hubWaMessage.findMany({ where: { providerSid: { in: statuses.map((s) => s.id) } } });
  const groups = new Map<string, { tool: Tool; businessId: string; items: { id: string; status: string; error: string | null }[] }>();
  for (const r of rows) {
    const s = statuses.find((x) => x.id === r.providerSid)!;
    const k = `${r.tool}:${r.businessId}`;
    if (!groups.has(k)) groups.set(k, { tool: r.tool as Tool, businessId: r.businessId, items: [] });
    groups.get(k)!.items.push({ id: s.id, status: s.status, error: s.errors?.[0]?.title ?? null });
  }
  for (const g of Array.from(groups.values())) {
    await postToTool(g.tool, g.businessId, { statuses: g.items }).catch(() => {});
  }
}

/**
 * Does an inbound message belong to a tool? Yes when a tool has written to
 * this phone for this business, and more recently than Regulars itself did
 * (a dealer who is also a shop customer goes to whoever spoke last).
 */
export async function inboundTool(businessId: string, phone: string): Promise<Tool | null> {
  const digits = waDigits(phone);
  const c = await prisma.hubWaContact.findFirst({ where: { businessId, phone: digits }, orderBy: { lastOutboundAt: "desc" } });
  if (!c) return null;
  const ours = await prisma.message.findFirst({
    where: { businessId, channel: "WHATSAPP", direction: "OUTBOUND", customer: { phone: { in: [digits, `+${digits}`] } } },
    orderBy: { createdAt: "desc" }, select: { createdAt: true },
  });
  return pickInboundOwner(c, ours?.createdAt ?? null) ? (c.tool as Tool) : null;
}

/** Pure part of inboundTool (unit-tested). */
export function pickInboundOwner(contact: { lastOutboundAt: Date | null; createdAt: Date }, regularsLastOutbound: Date | null) {
  const toolAt = contact.lastOutboundAt ?? contact.createdAt;
  return !regularsLastOutbound || toolAt.getTime() >= regularsLastOutbound.getTime();
}
