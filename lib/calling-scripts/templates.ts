import { Sector, Segment } from "@/lib/types";

// Static Hinglish calling-script library, per the PDF: "Abhi tak clinic aur
// salon ke liye variants bane hain, wo bhi Hinglish mein — taaki local
// customers ke saath naturally connect ho sake." Restaurant/food is a
// dedicated variant too (added per the PDF's own roadmap suggestion). Sectors
// without a dedicated variant yet (gym, retail) fall back to GENERIC.
//
// Placeholders filled by lib/calling-scripts/generate.ts:
//   {{customerName}}, {{businessName}}, {{lastVisitDate}}

export type ScriptTemplate = {
  segment: Segment;
  title: string;
  content: string;
};

const CLINIC_SCRIPTS: ScriptTemplate[] = [
  {
    segment: "AT_RISK",
    title: "At-risk patient follow-up",
    content:
      "Namaste {{customerName}} ji, main {{businessName}} se baat kar raha hoon. Aapne humein last time {{lastVisitDate}} ko visit kiya tha, uske baad se aap dobara nahi aaye — sab theek hai na? Agar koi follow-up checkup ya appointment chahiye ho to main abhi book kar sakta hoon, bataiye kaunsa din aapke liye convenient rahega?",
  },
  {
    segment: "DORMANT",
    title: "Dormant patient re-engagement",
    content:
      "Namaste {{customerName}} ji, {{businessName}} clinic se baat kar raha hoon. Kaafi time ho gaya hai aapko dekhe hue — {{lastVisitDate}} ke baad se. Hum bas ye confirm karna chahte the ki aap theek hain, aur agar koi regular checkup due hai to hum aapke liye priority slot arrange kar sakte hain. Kya main ek appointment schedule kar doon?",
  },
  {
    segment: "HIGH_SPENDER",
    title: "Priority patient care check-in",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Aap humare valued patients mein se ek hain, isliye personally call kar raha hoon — agar koi follow-up treatment ya health concern ho jiske liye aapko priority appointment chahiye ho, to bataiye, hum turant arrange kar denge.",
  },
  {
    segment: "REGULAR",
    title: "Regular patient wellness check-in",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Bas ek quick wellness check-in — sab kuch theek chal raha hai na? Agar aapko koi apne jaan-pehchaan wale ko refer karna ho jinhe humari services se fayda ho sakta hai, to hum unke liye bhi appointment arrange kar sakte hain.",
  },
  {
    segment: "NEW",
    title: "New patient welcome call",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Aapki recent visit ({{lastVisitDate}}) ke liye dhanyavaad. Hum chahte hain aapka experience acha rahe — agar koi bhi sawaal ho ya follow-up chahiye ho to bataiye, hum madad karne ke liye hamesha available hain.",
  },
];

const SALON_SCRIPTS: ScriptTemplate[] = [
  {
    segment: "AT_RISK",
    title: "At-risk client win-back",
    content:
      "Hi {{customerName}} ji, main {{businessName}} salon se baat kar rahi hoon. Aapko last time {{lastVisitDate}} ko dekha tha, phir aap nahi aaye — kya naya style try karna hai ya koi appointment book karni hai? Is week special slots available hain, batao kab aana convenient hai?",
  },
  {
    segment: "DORMANT",
    title: "Dormant client re-activation",
    content:
      "Hi {{customerName}} ji, {{businessName}} se baat kar rahi hoon. Bahut time ho gaya aapko dekhe hue — {{lastVisitDate}} ke baad se miss kar rahe hain aapko! Aapke liye ek special comeback offer hai agar aap is mahine visit karein. Kya main aapke liye slot book kar doon?",
  },
  {
    segment: "HIGH_SPENDER",
    title: "VIP client priority booking",
    content:
      "Hi {{customerName}} ji, {{businessName}} se baat kar rahi hoon. Aap humare VIP clients mein se hain, isliye personally inform kar rahi hoon ki naye seasonal treatments/styles available hain — priority booking chahiye ho to bataiye, main abhi aapke liye best slot rakh deti hoon.",
  },
  {
    segment: "REGULAR",
    title: "Regular client check-in + referral ask",
    content:
      "Hi {{customerName}} ji, {{businessName}} se baat kar rahi hoon. Aap humare regular customer hain, thank you! Agli booking ke liye reminder de rahi hoon, aur agar koi friend/family ko refer karna ho jinhe hum accommodate kar sakein, to unke liye bhi special slot rakh denge.",
  },
  {
    segment: "NEW",
    title: "New client welcome call",
    content:
      "Hi {{customerName}} ji, {{businessName}} se baat kar rahi hoon. Aapki recent visit ({{lastVisitDate}}) ke liye shukriya! Kaisa laga aapko experience? Agar kuch bhi feedback ho ya agli booking ke liye help chahiye ho, to bataiye.",
  },
];

const RESTAURANT_SCRIPTS: ScriptTemplate[] = [
  {
    segment: "AT_RISK",
    title: "At-risk diner win-back",
    content:
      "Namaste {{customerName}} ji, main {{businessName}} se baat kar raha hoon. Aapne last time {{lastVisitDate}} ko order/visit kiya tha, uske baad se nahi aaye — sab theek hai na? Is week menu mein kuch naya add hua hai, agar table book karni ho ya order karna ho to bataiye.",
  },
  {
    segment: "DORMANT",
    title: "Dormant diner re-engagement",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Bahut time ho gaya — {{lastVisitDate}} ke baad se aap nahi aaye, miss kar rahe hain! Aapke liye ek special comeback offer hai is hafte, kya main aapke liye table ya order arrange kar doon?",
  },
  {
    segment: "HIGH_SPENDER",
    title: "Frequent diner priority check-in",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Aap humare favourite regulars mein se hain, isliye personally bata raha hoon — weekend pe special table/priority reservation chahiye ho to abhi bata dijiye, main arrange kar deta hoon.",
  },
  {
    segment: "REGULAR",
    title: "Regular diner check-in + referral ask",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Aap humare regular customer hain, shukriya! Agar family/friends ko refer karna ho to unke liye bhi special table rakh denge — bataiye kab aana hai.",
  },
  {
    segment: "NEW",
    title: "New diner welcome call",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Aapki recent visit ({{lastVisitDate}}) ke liye dhanyavaad! Khana kaisa laga? Koi feedback ho ya agli booking ke liye help chahiye ho to bataiye.",
  },
];

const GENERIC_SCRIPTS: ScriptTemplate[] = [
  {
    segment: "AT_RISK",
    title: "At-risk customer follow-up",
    content:
      "Namaste {{customerName}} ji, main {{businessName}} se baat kar raha hoon. Aapko last time {{lastVisitDate}} ko dekha tha — sab theek hai na? Agar dobara visit ya order karna ho to bataiye, main abhi help kar deta hoon.",
  },
  {
    segment: "DORMANT",
    title: "Dormant customer re-engagement",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Kaafi time ho gaya — {{lastVisitDate}} ke baad se aap nahi aaye. Hum aapke liye ek special offer rakhna chahte hain, kya aap interested honge?",
  },
  {
    segment: "HIGH_SPENDER",
    title: "Priority customer check-in",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Aap humare top customers mein se ek hain — koi bhi cheez chahiye ho ya priority service chahiye ho to bataiye, hum turant arrange kar denge.",
  },
  {
    segment: "REGULAR",
    title: "Regular customer check-in",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Aap humare regular customer hain, dhanyavaad! Kuch naya chahiye ho ya feedback dena ho to bataiye.",
  },
  {
    segment: "NEW",
    title: "New customer welcome call",
    content:
      "Namaste {{customerName}} ji, {{businessName}} se baat kar raha hoon. Aapki recent visit ({{lastVisitDate}}) ke liye dhanyavaad — umeed hai experience acha raha. Koi feedback ho to zaroor bataiye.",
  },
];

const LIBRARY: Record<Sector, ScriptTemplate[]> = {
  CLINIC: CLINIC_SCRIPTS,
  SALON: SALON_SCRIPTS,
  RESTAURANT: RESTAURANT_SCRIPTS,
  GYM: GENERIC_SCRIPTS,
  RETAIL: GENERIC_SCRIPTS,
};

export function getTemplate(sector: Sector, segment: Segment): ScriptTemplate {
  const scripts = LIBRARY[sector];
  const match = scripts.find((s) => s.segment === segment);
  // DORMANT/AT_RISK/etc. are always present per sector above; NEW customers
  // with no segment-specific hook fall back to the NEW welcome script.
  return match ?? scripts.find((s) => s.segment === "NEW")!;
}

export function allTemplatesForSector(sector: Sector): ScriptTemplate[] {
  return LIBRARY[sector];
}
