/**
 * Every WhatsApp message template Regulars sends (Nov 2026).
 *
 * WhatsApp only lets a business START a conversation with a template that
 * Meta has approved. Inside the 24-hour window after a customer (or the
 * owner) messages us, plain text is allowed instead — lib/whatsapp-send.ts
 * handles that choice. This file is the single list of templates:
 *   - the admin page /admin/whatsapp-templates submits them to Meta
 *   - `npm run wa:templates` does the same from the command line
 *   - lib/whatsapp-send.ts picks the right one by key + language
 *
 * Meta's rules this list follows (templates break them get rejected):
 *   - a body may not start or end with a variable
 *   - variables may not contain new lines, tabs or 4+ spaces in a row
 *   - every variable needs an example value when submitting
 *   - the same template name can exist once per language
 *
 * Hinglish has no WhatsApp language code, so it is its own template
 * ("<name>_hinglish") registered under English ("en").
 *
 * Pure module (no Prisma) so it can be unit-tested and used by the CLI.
 */

export type WaLang = "en" | "hinglish" | "hi" | "pa";
export const WA_LANGS: WaLang[] = ["en", "hinglish", "hi", "pa"];

export type WaCategory = "UTILITY" | "MARKETING";

export type WaTemplateKey =
  | "missed_call"
  | "missed_lead"
  | "quote_followup"
  | "service_due"
  | "winback"
  | "review_request"
  | "owner_brief"
  | "owner_weekly"
  | "owner_new_message";

type Def = {
  key: WaTemplateKey;
  category: WaCategory;
  audience: "customer" | "owner";
  /** What the {{n}} variables are, in order. */
  vars: string[];
  /** Example values for Meta review, in order. */
  examples: Partial<Record<WaLang, string[]>> & { en: string[] };
  bodies: Partial<Record<WaLang, string>>;
};

const BOOK_EX = "You can book here: https://cal.com/glow-salon";

export const WA_TEMPLATE_DEFS: Def[] = [
  {
    key: "missed_call",
    category: "UTILITY",
    audience: "customer",
    vars: ["customer first name", "business name", "next step (booking link or 'reply here')"],
    examples: {
      en: ["Priya", "Glow Salon", BOOK_EX],
      hinglish: ["Priya", "Glow Salon", "Aap yahan booking kar sakte hain: https://cal.com/glow-salon"],
      hi: ["प्रिया", "Glow Salon", "आप यहाँ बुकिंग कर सकते हैं: https://cal.com/glow-salon"],
      pa: ["ਪ੍ਰਿਆ", "Glow Salon", "ਤੁਸੀਂ ਇੱਥੇ ਬੁਕਿੰਗ ਕਰ ਸਕਦੇ ਹੋ: https://cal.com/glow-salon"],
    },
    bodies: {
      en: "Hi {{1}}, this is {{2}}. Sorry we missed your call. {{3}} We will get back to you soon.",
      hinglish: "Namaste {{1}}, {{2}} se baat kar rahe hain. Maaf kijiye, hum aapki call nahi utha paaye. {{3}} Hum jaldi aapse sampark karenge.",
      hi: "नमस्ते {{1}}, यह {{2}} है। माफ़ कीजिए, हम आपकी कॉल नहीं उठा पाए। {{3}} हम जल्द ही आपसे संपर्क करेंगे।",
      pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {{1}}, ਇਹ {{2}} ਹੈ। ਮਾਫ਼ ਕਰਨਾ, ਅਸੀਂ ਤੁਹਾਡੀ ਕਾਲ ਨਹੀਂ ਚੁੱਕ ਸਕੇ। {{3}} ਅਸੀਂ ਜਲਦੀ ਤੁਹਾਡੇ ਨਾਲ ਸੰਪਰਕ ਕਰਾਂਗੇ।",
    },
  },
  {
    key: "missed_lead",
    category: "UTILITY",
    audience: "customer",
    vars: ["customer first name", "business name", "next step"],
    examples: { en: ["Daniel", "Maple HVAC", BOOK_EX] },
    bodies: {
      en: "Hi {{1}}, this is {{2}}. Sorry we could not help when you called. Do you still need a hand? {{3}} Thank you!",
      hinglish: "Namaste {{1}}, {{2}} se. Maaf kijiye, jab aapne call kiya tab hum madad nahi kar paaye. Kya aapko abhi bhi madad chahiye? {{3}} Dhanyavaad!",
      hi: "नमस्ते {{1}}, यह {{2}} है। माफ़ कीजिए, जब आपने कॉल किया तब हम मदद नहीं कर पाए। क्या आपको अभी भी मदद चाहिए? {{3}} धन्यवाद!",
      pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {{1}}, ਇਹ {{2}} ਹੈ। ਮਾਫ਼ ਕਰਨਾ, ਜਦੋਂ ਤੁਸੀਂ ਕਾਲ ਕੀਤੀ ਤਾਂ ਅਸੀਂ ਮਦਦ ਨਹੀਂ ਕਰ ਸਕੇ। ਕੀ ਤੁਹਾਨੂੰ ਹਾਲੇ ਵੀ ਮਦਦ ਚਾਹੀਦੀ ਹੈ? {{3}} ਧੰਨਵਾਦ!",
    },
  },
  {
    key: "quote_followup",
    category: "UTILITY",
    audience: "customer",
    vars: ["customer first name", "business name", "next step"],
    examples: { en: ["Daniel", "Maple HVAC", BOOK_EX] },
    bodies: {
      en: "Hi {{1}}, this is {{2}} following up on the quote we sent you. Any questions, or shall we lock in a date? {{3}} Thank you!",
      hinglish: "Namaste {{1}}, {{2}} se, humne jo quote bheja tha uske baare mein puchna tha. Koi sawaal hai, ya date fix kar dein? {{3}} Dhanyavaad!",
      hi: "नमस्ते {{1}}, {{2}} की ओर से, हमने जो कोटेशन भेजा था उसके बारे में पूछना था। कोई सवाल है, या तारीख तय कर दें? {{3}} धन्यवाद!",
      pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {{1}}, {{2}} ਵੱਲੋਂ, ਅਸੀਂ ਜੋ ਕੋਟੇਸ਼ਨ ਭੇਜੀ ਸੀ ਉਸ ਬਾਰੇ ਪੁੱਛਣਾ ਸੀ। ਕੋਈ ਸਵਾਲ ਹੈ, ਜਾਂ ਤਾਰੀਖ਼ ਪੱਕੀ ਕਰ ਦੇਈਏ? {{3}} ਧੰਨਵਾਦ!",
    },
  },
  {
    key: "service_due",
    category: "MARKETING",
    audience: "customer",
    vars: ["customer first name", "business name", "next step"],
    examples: { en: ["Priya", "Glow Salon", BOOK_EX] },
    bodies: {
      en: "Hi {{1}}, a friendly reminder from {{2}}: you are due for your next service. {{3}} Reply STOP to stop these messages.",
      hinglish: "Namaste {{1}}, {{2}} ki taraf se yaad dilana tha ki aapki agli service ka time ho gaya hai. {{3}} Ye messages band karne ke liye STOP likhein.",
      hi: "नमस्ते {{1}}, {{2}} की ओर से याद दिलाना था कि आपकी अगली सर्विस का समय हो गया है। {{3}} ये मैसेज बंद करने के लिए STOP लिखें।",
      pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {{1}}, {{2}} ਵੱਲੋਂ ਯਾਦ ਕਰਵਾਉਣਾ ਸੀ ਕਿ ਤੁਹਾਡੀ ਅਗਲੀ ਸਰਵਿਸ ਦਾ ਸਮਾਂ ਹੋ ਗਿਆ ਹੈ। {{3}} ਇਹ ਮੈਸੇਜ ਬੰਦ ਕਰਨ ਲਈ STOP ਲਿਖੋ।",
    },
  },
  {
    key: "winback",
    category: "MARKETING",
    audience: "customer",
    vars: ["customer first name", "business name", "next step"],
    examples: { en: ["Priya", "Glow Salon", BOOK_EX] },
    bodies: {
      en: "Hi {{1}}, it has been a while since we saw you at {{2}} and we would love to welcome you back. {{3}} Reply STOP to stop these messages.",
      hinglish: "Namaste {{1}}, kaafi time ho gaya aap {{2}} nahi aaye, hum aapka phir se swagat karna chahenge. {{3}} Ye messages band karne ke liye STOP likhein.",
      hi: "नमस्ते {{1}}, काफ़ी समय हो गया आप {{2}} नहीं आए, हम फिर से आपका स्वागत करना चाहेंगे। {{3}} ये मैसेज बंद करने के लिए STOP लिखें।",
      pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {{1}}, ਕਾਫ਼ੀ ਸਮਾਂ ਹੋ ਗਿਆ ਤੁਸੀਂ {{2}} ਨਹੀਂ ਆਏ, ਅਸੀਂ ਫਿਰ ਤੋਂ ਤੁਹਾਡਾ ਸਵਾਗਤ ਕਰਨਾ ਚਾਹਾਂਗੇ। {{3}} ਇਹ ਮੈਸੇਜ ਬੰਦ ਕਰਨ ਲਈ STOP ਲਿਖੋ।",
    },
  },
  {
    key: "review_request",
    category: "MARKETING",
    audience: "customer",
    vars: ["customer first name", "business name", "Google review link"],
    examples: { en: ["Priya", "Glow Salon", "https://g.page/r/glow-salon/review"] },
    bodies: {
      en: "Hi {{1}}, thank you for choosing {{2}}! If you were happy with our service, please leave us a quick Google review: {{3}} It really helps us.",
      hinglish: "Namaste {{1}}, {{2}} ko chunne ke liye dhanyavaad! Agar aapko hamari service achhi lagi, toh please ek chhota sa Google review de dijiye: {{3}} Isse hamein bahut madad milti hai.",
      hi: "नमस्ते {{1}}, {{2}} को चुनने के लिए धन्यवाद! अगर आपको हमारी सेवा अच्छी लगी, तो कृपया एक छोटा सा Google review दीजिए: {{3}} इससे हमें बहुत मदद मिलती है।",
      pa: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {{1}}, {{2}} ਨੂੰ ਚੁਣਨ ਲਈ ਧੰਨਵਾਦ! ਜੇ ਤੁਹਾਨੂੰ ਸਾਡੀ ਸੇਵਾ ਚੰਗੀ ਲੱਗੀ, ਤਾਂ ਕਿਰਪਾ ਕਰਕੇ ਇੱਕ ਛੋਟਾ ਜਿਹਾ Google review ਦਿਓ: {{3}} ਇਸ ਨਾਲ ਸਾਨੂੰ ਬਹੁਤ ਮਦਦ ਮਿਲਦੀ ਹੈ।",
    },
  },
  // ── To the business owner ─────────────────────────────────────────────
  {
    key: "owner_brief",
    category: "UTILITY",
    audience: "owner",
    vars: ["business name", "weekday", "today's numbered plan on one line"],
    examples: { en: ["Glow Salon", "Tue", "1) Call back Daniel R. (missed call yesterday) 2) Win back 6 quiet customers"] },
    bodies: {
      en: "Good morning! Here is today's plan for {{1}} ({{2}}): {{3}} Reply with the item numbers, ALL or SKIP.",
      hinglish: "Good morning! {{1}} ka aaj ka plan ({{2}}): {{3}} Item numbers, ALL ya SKIP likh kar reply karein.",
    },
  },
  {
    key: "owner_weekly",
    category: "UTILITY",
    audience: "owner",
    vars: ["business name", "this week's summary on one line"],
    examples: { en: ["Glow Salon", "I took 12 actions: won back 6 customers, asked 4 for reviews. 3 customers came back, about ₹4,500."] },
    bodies: {
      en: "Your weekly Growth Manager report for {{1}}: {{2}} Reply here if you have any questions.",
      hinglish: "Namaste! {{1}} ki weekly Growth Manager report: {{2}} Koi sawaal ho toh yahan reply karein.",
    },
  },
  {
    key: "owner_new_message",
    category: "UTILITY",
    audience: "owner",
    vars: ["business name", "customer name and number", "their message"],
    examples: { en: ["Glow Salon", "Priya (+91 98765 43210)", "Can I come at 5 today?"] },
    bodies: {
      en: "New customer message for {{1}} from {{2}}: {{3}} Open your inbox to reply.",
      hinglish: "Naya customer message {{1}} ke liye, {{2}} se: {{3}} Reply karne ke liye apna inbox kholein.",
    },
  },
];

export const templatePrefix = () => (process.env.WHATSAPP_TEMPLATE_PREFIX || "loopdesk").toLowerCase().replace(/[^a-z0-9_]/g, "_");

/** Meta template name: lowercase letters, digits, underscores. */
export function templateName(key: WaTemplateKey, lang: WaLang) {
  return `${templatePrefix()}_${key}${lang === "hinglish" ? "_hinglish" : ""}`;
}

/** WhatsApp language code for one of our languages. */
export function metaLanguage(lang: WaLang) {
  return lang === "hinglish" ? "en" : lang;
}

export function getDef(key: WaTemplateKey) {
  const d = WA_TEMPLATE_DEFS.find((t) => t.key === key);
  if (!d) throw new Error(`Unknown WhatsApp template ${key}`);
  return d;
}

/** The language to use: the asked one if this template has it, else Hinglish → English. */
export function resolveLang(key: WaTemplateKey, lang: string | null | undefined): WaLang {
  const d = getDef(key);
  const want = (WA_LANGS as string[]).includes(lang ?? "") ? (lang as WaLang) : "en";
  if (d.bodies[want]) return want;
  if (want !== "en" && d.bodies.hinglish) return "hinglish"; // hi/pa owners get Hinglish owner messages
  return "en";
}

/**
 * Makes a value safe for a template variable: no new lines / tabs / long
 * runs of spaces (Meta rejects the send otherwise), never empty, capped.
 */
export function sanitizeParam(v: string | null | undefined, max = 900) {
  const s = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (!s) return "-";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Fills a body with its values — what the customer actually sees (stored in the inbox). */
export function renderTemplate(key: WaTemplateKey, lang: WaLang, params: string[]) {
  const body = getDef(key).bodies[lang] ?? getDef(key).bodies.en!;
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => sanitizeParam(params[Number(n) - 1]));
}

/** "there" / "ji" when we don't know the customer's first name. */
export function fallbackName(lang: WaLang) {
  return lang === "en" ? "there" : lang === "hi" ? "जी" : lang === "pa" ? "ਜੀ" : "ji";
}

/** The {{3}} "next step" line: a booking link if the location has one, else "reply here". */
export function nextStep(lang: WaLang, bookingUrl?: string | null) {
  const url = bookingUrl?.trim();
  switch (lang) {
    case "hinglish": return url ? `Aap yahan booking kar sakte hain: ${url}` : "Is message ka reply karke bataiye aapko kya chahiye.";
    case "hi": return url ? `आप यहाँ बुकिंग कर सकते हैं: ${url}` : "इस मैसेज का जवाब देकर बताइए कि आपको क्या चाहिए।";
    case "pa": return url ? `ਤੁਸੀਂ ਇੱਥੇ ਬੁਕਿੰਗ ਕਰ ਸਕਦੇ ਹੋ: ${url}` : "ਇਸ ਮੈਸੇਜ ਦਾ ਜਵਾਬ ਦੇ ਕੇ ਦੱਸੋ ਕਿ ਤੁਹਾਨੂੰ ਕੀ ਚਾਹੀਦਾ ਹੈ।";
    default: return url ? `You can book here: ${url}` : "Just reply to this message with what you need.";
  }
}

export type MetaTemplatePayload = {
  name: string;
  language: string;
  category: WaCategory;
  components: Array<{ type: "BODY"; text: string; example: { body_text: string[][] } }>;
};

/** Every template × language, in the shape Meta's message_templates API takes. */
export function allMetaTemplates(): Array<MetaTemplatePayload & { key: WaTemplateKey; lang: WaLang }> {
  const out: Array<MetaTemplatePayload & { key: WaTemplateKey; lang: WaLang }> = [];
  for (const d of WA_TEMPLATE_DEFS) {
    for (const lang of WA_LANGS) {
      const text = d.bodies[lang];
      if (!text) continue;
      const example = (d.examples[lang] ?? d.examples.en).map((v) => sanitizeParam(v));
      out.push({
        key: d.key, lang, name: templateName(d.key, lang), language: metaLanguage(lang), category: d.category,
        components: [{ type: "BODY", text, example: { body_text: [example] } }],
      });
    }
  }
  return out;
}

/** Checks one body against Meta's structural rules. Returns problems (empty = fine). */
export function lintBody(text: string, varCount: number): string[] {
  const problems: string[] = [];
  const nums = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  if (/^\s*\{\{\d+\}\}/.test(text)) problems.push("starts with a variable");
  if (/\{\{\d+\}\}\s*[.!?।]?\s*$/.test(text)) problems.push("ends with a variable");
  const expected = Array.from({ length: varCount }, (_, i) => i + 1);
  if (JSON.stringify([...new Set(nums)].sort((a, b) => a - b)) !== JSON.stringify(expected)) problems.push(`variables should be {{1}}..{{${varCount}}}`);
  if (text.length > 1024) problems.push("longer than 1024 characters");
  return problems;
}
