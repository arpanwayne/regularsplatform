import { logEvent } from "@/lib/logger";
import { estimateClaudeCostUsd, recordUsageEvent } from "@/lib/usage";

/**
 * AI help for offers (Nov 2026): rewrite a rough offer into a message people
 * want to read. The pure parts (prompt, clean-up, the "no invented numbers"
 * check) are unit-tested; askClaude() is the only network call.
 *
 * Without ANTHROPIC_API_KEY these features say so instead of guessing.
 */

export const OFFER_MODEL = process.env.OFFER_AI_MODEL || process.env.GROWTH_MODEL || "claude-haiku-4-5-20251001";

export const LANG_STYLE: Record<string, string> = {
  en: "plain, friendly English",
  hinglish: "natural Hinglish (Hindi in Roman script mixed with English, like a WhatsApp message)",
  hi: "simple Hindi in Devanagari",
  pa: "simple Punjabi in Gurmukhi",
};

/** The offer goes inside a WhatsApp template variable: one line, and the template already greets and adds STOP. */
export const OFFER_MAX = 480;

export async function askClaude(businessId: string, prompt: string, maxTokens: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI isn't switched on for this server yet (ANTHROPIC_API_KEY is not set)." };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: OFFER_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const inTok = data?.usage?.input_tokens ?? 0, outTok = data?.usage?.output_tokens ?? 0;
    await recordUsageEvent({ businessId, type: "AI_SCRIPT_PERSONALIZATION", inputTokens: inTok, outputTokens: outTok, estimatedCostUsd: estimateClaudeCostUsd(inTok, outTok) });
    return { ok: true, text: String(data?.content?.[0]?.text ?? "") };
  } catch (err) {
    await logEvent({ businessId, source: "API", level: "WARN", message: "Offer AI call failed", meta: { error: err instanceof Error ? err.message : String(err) } });
    return { ok: false, error: "The AI couldn't answer just now. Try again in a minute." };
  }
}

/** The first {...} in a reply, parsed; null if there isn't valid JSON. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

/** Numbers (prices, %, dates) in a text, normalised: "₹1,499" → "1499". */
export function numbersIn(text: string): string[] {
  return [...String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, "").replace(/\.0+$/, ""));
}

/**
 * The AI may reword but never invent a price, percentage or date: every
 * number it writes must already be in what the business gave us.
 */
export function inventedNumbers(output: string, ...sources: Array<string | number | null | undefined>): string[] {
  const allowed = new Set(sources.flatMap((s) => (s == null ? [] : numbersIn(String(s)))));
  return [...new Set(numbersIn(output).filter((n) => !allowed.has(n)))];
}

/** One clean line WhatsApp accepts in a template variable. */
export function cleanOfferText(text: string, max = OFFER_MAX): string {
  let s = String(text ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  s = s.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  s = s.replace(/\s*(reply|text)\s+stop\b.*$/i, "").trim(); // the template adds the STOP line
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : s;
}

export type RewriteInput = {
  businessName: string; sector?: string | null; language: string;
  draft: string; title?: string; discountPercent?: number | null; freebie?: boolean; segments?: string[];
};

const SEGMENT_WORDS: Record<string, string> = {
  REGULAR: "regular customers who come often",
  HIGH_SPENDER: "the business's highest-spending customers",
  NEW: "new customers who visited recently for the first time",
  AT_RISK: "customers who used to come but haven't for a few weeks",
  DORMANT: "customers who haven't come in over two months",
};

export function rewritePrompt(p: RewriteInput): string {
  const who = p.segments?.length ? p.segments.map((s) => SEGMENT_WORDS[s] ?? s).join("; ") : "all of the business's customers";
  return [
    `You write WhatsApp promotional offers for "${p.businessName}", a local ${String(p.sector ?? "business").toLowerCase().replace(/_/g, " ")}.`,
    `Rewrite the owner's rough offer below into one short, attractive, compelling message in ${LANG_STYLE[p.language] ?? LANG_STYLE.en}.`,
    `It goes to: ${who}. Speak to them.`,
    "Rules:",
    `- At most 350 characters, one paragraph, no line breaks. At most one emoji.`,
    "- Keep every real detail (what, price, discount, dates, conditions). Do NOT invent prices, percentages, dates, deadlines, products or guarantees that aren't in the draft.",
    "- Do not start with a greeting or the business name, and do not add an opt-out line (the template adds both).",
    "- End with a clear next step (visit, reply, show this message at the counter) only if it fits the draft.",
    "- Also write a short title (max 50 characters) for the owner's offer list.",
    'Reply ONLY with JSON: {"title": "...", "message": "..."}',
    "",
    `Owner's title: ${p.title?.trim() || "(none)"}`,
    `Discount: ${p.discountPercent ? `${p.discountPercent}%` : "(none given)"}${p.freebie ? " · includes a free item or bonus points" : ""}`,
    `Rough offer: ${p.draft.trim()}`,
  ].join("\n");
}

export async function rewriteOffer(businessId: string, p: RewriteInput): Promise<{ ok: true; title: string; message: string } | { ok: false; error: string }> {
  const r = await askClaude(businessId, rewritePrompt(p), 400);
  if (!r.ok) return r;
  const j = parseJsonObject(r.text);
  const message = cleanOfferText(typeof j?.message === "string" ? j.message : "");
  const title = cleanOfferText(typeof j?.title === "string" ? j.title : "", 80);
  if (message.length < 10) return { ok: false, error: "The AI's answer wasn't usable. Try again." };
  const invented = inventedNumbers(`${title} ${message}`, p.draft, p.title, p.discountPercent);
  if (invented.length) {
    await logEvent({ businessId, source: "API", level: "WARN", message: "Offer rewrite dropped: it added numbers that weren't in the draft", meta: { invented } });
    return { ok: false, error: `The AI added details you didn't give (${invented.join(", ")}). Try again, or add those details to your draft if they're real.` };
  }
  return { ok: true, title: title || p.title?.trim() || "", message };
}
