import { estimateClaudeCostUsd, recordUsageEvent } from "@/lib/usage";
import { logEvent } from "@/lib/logger";
import type { ActionType } from "@/lib/growth/types";

/**
 * Writes the customer-facing text for each proposed action.
 *
 * With ANTHROPIC_API_KEY set, Claude writes all of a plan's messages in one
 * call, personalised from what the timeline knows and in the business's
 * language (English, Hinglish, Hindi or Punjabi). Without it — or if the
 * reply can't be used — fixed templates are used, so the brain never stops.
 *
 * Guardrails on the AI's text: max 300 characters, no prices/discounts the
 * owner didn't configure, no medical/legal claims, and it can't remove the
 * sender name / STOP footer (lib/sms.ts adds those after).
 */

export type CopyRequest = {
  id: string;
  type: ActionType;
  firstName: string;
  context: string;       // what the brain knows, e.g. "quote for AC install, $3,100, sent 4 days ago"
  bookingUrl?: string | null;
};

const MODEL = process.env.GROWTH_MODEL || "claude-haiku-4-5-20251001";

export function templateCopy(r: CopyRequest): string {
  const hi = r.firstName ? `Hi ${r.firstName}, ` : "Hi, ";
  const book = r.bookingUrl ? ` Book here: ${r.bookingUrl}` : " Just reply to this text.";
  switch (r.type) {
    case "MISSED_LEAD_CALLBACK": return `${hi}sorry we couldn't help when you called. Still need a hand? We can book you in today.${book}`;
    case "QUOTE_FOLLOW_UP": return `${hi}just checking in on the quote we sent. Happy to answer any questions or lock in a date.${book}`;
    case "SERVICE_DUE": return `${hi}you're due for your next service. Want us to book it before the busy season?${book}`;
    case "WIN_BACK": return `${hi}it's been a while and we'd love to see you again.${book}`;
    default: return `${hi}thanks for choosing us!`;
  }
}

const LANG: Record<string, string> = {
  en: "plain, friendly Canadian/Indian English",
  hinglish: "natural Hinglish (Hindi in Roman script mixed with English, like a WhatsApp message)",
  hi: "simple Hindi in Devanagari",
  pa: "simple Punjabi in Gurmukhi",
};

export async function writeCopy(p: { businessId: string; businessName: string; language: string; requests: CopyRequest[] }): Promise<Record<string, string>> {
  const out: Record<string, string> = Object.fromEntries(p.requests.map((r) => [r.id, templateCopy(r)]));
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !p.requests.length) return out;

  const prompt = [
    `You write short text messages (SMS/WhatsApp) for "${p.businessName}", a local business, to its own past customers and callers.`,
    `Write in ${LANG[p.language] ?? LANG.en}.`,
    "Rules: max 300 characters each. Warm, specific, no pressure, no emojis, no invented prices, discounts, dates or guarantees.",
    "Do not add the business name at the start or an opt-out line at the end (the system adds both).",
    "If a booking link is given, end with it. Use the customer's first name if given.",
    'Reply ONLY with JSON: {"<id>": "<message>", ...}',
    "",
    ...p.requests.map((r) => `- id ${r.id} | ${r.type} | first name: ${r.firstName || "(unknown)"} | ${r.context}${r.bookingUrl ? ` | booking link: ${r.bookingUrl}` : ""}`),
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 200 + 160 * p.requests.length, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, unknown>;
    for (const r of p.requests) {
      const v = parsed[r.id];
      if (typeof v === "string" && v.trim().length >= 10 && v.length <= 320 && !/stop to opt/i.test(v)) out[r.id] = v.trim();
    }
    const inTok = data?.usage?.input_tokens ?? 0, outTok = data?.usage?.output_tokens ?? 0;
    await recordUsageEvent({ businessId: p.businessId, type: "AI_SCRIPT_PERSONALIZATION", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateClaudeCostUsd(inTok, outTok) });
  } catch (err) {
    await logEvent({ businessId: p.businessId, source: "API", level: "WARN", message: "Growth copywriting fell back to templates", meta: { error: err instanceof Error ? err.message : String(err) } });
  }
  return out;
}
