// Fixes from "Regulars Portal Manual aur Bug Report" (16 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderPhone } from "../lib/phone";
import { legacyTemplateName, resolveLang, templateName, allMetaTemplates, WA_TEMPLATE_DEFS } from "../lib/whatsapp-templates";
import { growthAllowed } from "../lib/growth/access";
import { DEFAULT_AUTONOMY } from "../lib/growth/types";
import { winBackReason } from "../lib/growth/planner";
import { ownerChannel, ownerPhoneFor } from "../lib/growth/brief";

const setEnv = (k: string, v: string | undefined) => { const e = process.env as Record<string, string | undefined>; if (v === undefined) delete e[k]; else e[k] = v; };

test("B14: placeholder mobiles are recognised, real ones are not", () => {
  for (const p of ["+19876543210", "9876543210", "+911234567890", "0000000000", "+15555555555", "+14165550123"]) assert.equal(isPlaceholderPhone(p), true, p);
  for (const p of ["+918725837692", "+917986032428", "+14165551234", "+16475557788", ""]) assert.equal(isPlaceholderPhone(p), false, p);
});

const settings = (over: Record<string, unknown> = {}) => ({ ownerPhone: "+918725837692", ...over }) as never;
const biz = (over: Record<string, unknown> = {}) => ({ country: "IN", defaultChannel: "WHATSAPP", locations: [{ status: "ACTIVE", smsFromNumber: null, ownerNotifyPhone: null, whatsappPhoneNumberId: null, whatsappAccessToken: null }], ...over }) as never;

test("B2: the owner brief picks a channel that can really reach the owner, or says why not", () => {
  setEnv("WHATSAPP_SHARED_PHONE_NUMBER_ID", "111"); setEnv("WHATSAPP_SHARED_ACCESS_TOKEN", "tok");
  setEnv("TWILIO_ACCOUNT_SID", undefined); setEnv("TWILIO_AUTH_TOKEN", undefined); setEnv("GROWTH_SMS_FROM", undefined);
  setEnv("WHATSAPP_OWNER_ANY_COUNTRY", undefined);

  assert.deepEqual(ownerChannel(settings(), biz()), { ok: true, channel: "WHATSAPP", to: "+918725837692" });
  // A Canadian SMS business without Twilio still gets its brief on WhatsApp (owner, not a customer).
  assert.equal((ownerChannel(settings({ ownerPhone: "+14165551234" }), biz({ country: "CA", defaultChannel: "SMS" })) as { channel: string }).channel, "WHATSAPP");
  // ...unless that is switched off; then the reason names what's missing.
  setEnv("WHATSAPP_OWNER_ANY_COUNTRY", "false");
  const r = ownerChannel(settings({ ownerPhone: "+14165551234" }), biz({ country: "CA", defaultChannel: "SMS" }));
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /texting number/);
  assert.match((r as { reason: string }).reason, /Twilio/);
  setEnv("WHATSAPP_OWNER_ANY_COUNTRY", undefined);

  // SMS business with Twilio + a texting number: SMS.
  setEnv("TWILIO_ACCOUNT_SID", "AC1"); setEnv("TWILIO_AUTH_TOKEN", "t"); setEnv("GROWTH_SMS_FROM", "+14165550000");
  assert.equal((ownerChannel(settings({ ownerPhone: "+14165551234" }), biz({ country: "CA", defaultChannel: "SMS" })) as { channel: string }).channel, "SMS");
  setEnv("TWILIO_ACCOUNT_SID", undefined); setEnv("TWILIO_AUTH_TOKEN", undefined); setEnv("GROWTH_SMS_FROM", undefined);

  // Dummy and missing numbers are never "ready".
  assert.match((ownerChannel(settings({ ownerPhone: "+19876543210" }), biz()) as { reason: string }).reason, /placeholder/);
  assert.equal(ownerPhoneFor(settings({ ownerPhone: "+19876543210" }), biz()), null);
  assert.match((ownerChannel(settings({ ownerPhone: null }), biz()) as { reason: string }).reason, /No owner mobile/);
  setEnv("WHATSAPP_SHARED_PHONE_NUMBER_ID", undefined); setEnv("WHATSAPP_SHARED_ACCESS_TOKEN", undefined);
});

test("B12: the owner brief never uses the Hinglish template Meta filed as MARKETING", () => {
  assert.equal(resolveLang("owner_brief", "hinglish"), "en");
  assert.equal(resolveLang("owner_brief", "pa"), "en");
  // The utility owner templates have Hindi and Punjabi...
  assert.equal(resolveLang("owner_weekly", "pa"), "pa");
  assert.equal(resolveLang("owner_new_message", "hi"), "hi");
  assert.equal(resolveLang("owner_weekly", "hinglish"), "hinglish");
  // ...except the two Meta filed as MARKETING, which fall back to Hinglish.
  assert.equal(resolveLang("owner_weekly", "hi"), "hinglish");
  assert.equal(resolveLang("owner_new_message", "pa"), "hinglish");
});

test("B12: review requests end with the STOP line under a new name, old name kept as fallback", () => {
  const rr = WA_TEMPLATE_DEFS.find((d) => d.key === "review_request")!;
  for (const body of Object.values(rr.bodies)) assert.match(body!, /STOP/);
  assert.equal(templateName("review_request", "en"), "loopdesk_review_request_v2");
  assert.equal(templateName("review_request", "hinglish"), "loopdesk_review_request_v2_hinglish");
  assert.equal(legacyTemplateName("review_request", "hinglish"), "loopdesk_review_request_hinglish");
  assert.equal(legacyTemplateName("missed_call", "en"), null);
  assert.ok(allMetaTemplates().some((t) => t.name === "loopdesk_review_request_v2" && t.language === "en"));
});

test("B19: example values belong to one made-up business", () => {
  for (const key of ["missed_lead", "quote_followup"]) {
    const ex = WA_TEMPLATE_DEFS.find((d) => d.key === key)!.examples.en;
    assert.equal(ex[1], "Maple HVAC");
    assert.match(ex[2], /maple-hvac/);
  }
});

test("B9: only plans that include it get the Growth Manager", () => {
  assert.equal(growthAllowed({ plan: "STARTER", frontDeskPlan: null, bundleStatus: "NONE" }), false);
  assert.equal(growthAllowed({ plan: "GROWTH", frontDeskPlan: null, bundleStatus: "NONE" }), true);
  assert.equal(growthAllowed({ plan: "PRO", frontDeskPlan: null, bundleStatus: "NONE" }), true);
  assert.equal(growthAllowed({ plan: "STARTER", frontDeskPlan: "GROW", bundleStatus: "ACTIVE" }), true);
  assert.equal(growthAllowed({ plan: "STARTER", frontDeskPlan: "ANSWER", bundleStatus: "ACTIVE" }), false);
  assert.equal(growthAllowed({ plan: "STARTER", frontDeskPlan: "GROW", bundleStatus: "LAPSED" }), false);
});

test("B17: every action asks first by default", () => {
  for (const [type, level] of Object.entries(DEFAULT_AUTONOMY)) assert.notEqual(level, "AUTO", type);
});

test("B10: win-back reason reads right when there are no visits", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86400000);
  assert.equal(winBackReason({ segment: "DORMANT", visitCount: 0, lastSeenAt: ago(63), firstSeenAt: ago(63) }, now), "Dormant: added 63 days ago, never visited.");
  assert.equal(winBackReason({ segment: "AT_RISK", visitCount: 3, lastSeenAt: ago(40) }, now), "At risk: last seen 40 days ago after 3 visits.");
});
