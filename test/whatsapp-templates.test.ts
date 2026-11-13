import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WA_LANGS, WA_TEMPLATE_DEFS, allMetaTemplates, lintBody, nextStep, renderTemplate, resolveLang, sanitizeParam, templateName,
} from "../lib/whatsapp-templates";
import { whatsappSenderFor, windowOpen } from "../lib/whatsapp-sender";

const setEnv = (k: string, v: string | undefined) => { const e = process.env as Record<string, string | undefined>; if (v === undefined) delete e[k]; else e[k] = v; };

test("every template body follows Meta's rules", () => {
  for (const d of WA_TEMPLATE_DEFS) {
    for (const [lang, body] of Object.entries(d.bodies)) {
      assert.deepEqual(lintBody(body!, d.vars.length), [], `${d.key} (${lang})`);
    }
    for (const ex of Object.values(d.examples)) assert.equal(ex!.length, d.vars.length, `${d.key} examples`);
  }
});

test("customer templates exist in all four languages, owner ones in English + Hinglish", () => {
  for (const d of WA_TEMPLATE_DEFS) {
    const need = d.audience === "customer" ? WA_LANGS : ["en", "hinglish"];
    for (const l of need) assert.ok(d.bodies[l as keyof typeof d.bodies], `${d.key} missing ${l}`);
  }
});

test("template names are unique per language and valid for Meta", () => {
  const all = allMetaTemplates();
  assert.equal(new Set(all.map((t) => `${t.name}|${t.language}`)).size, all.length);
  for (const t of all) assert.match(t.name, /^[a-z0-9_]{1,512}$/);
  assert.equal(templateName("winback", "hinglish"), "loopdesk_winback_hinglish");
  assert.equal(all.find((t) => t.name === "loopdesk_winback_hinglish")?.language, "en");
});

test("variable values are made safe for WhatsApp", () => {
  assert.equal(sanitizeParam("line one\nline two\t   end"), "line one line two end");
  assert.equal(sanitizeParam(""), "-");
  assert.equal(sanitizeParam(null), "-");
  assert.equal(sanitizeParam("x".repeat(2000)).length, 900);
});

test("rendering fills the variables the customer will see", () => {
  const text = renderTemplate("missed_call", "en", ["Priya", "Glow Salon", nextStep("en", "https://cal.com/glow")]);
  assert.equal(text, "Hi Priya, this is Glow Salon. Sorry we missed your call. You can book here: https://cal.com/glow We will get back to you soon.");
  assert.match(nextStep("hinglish", null), /reply/);
});

test("owner messages fall back to Hinglish for Hindi/Punjabi, unknown languages to English", () => {
  assert.equal(resolveLang("owner_brief", "pa"), "hinglish");
  assert.equal(resolveLang("winback", "pa"), "pa");
  assert.equal(resolveLang("winback", "fr"), "en");
});

test("India sends from the shared number unless the location has its own", () => {
  setEnv("WHATSAPP_SHARED_PHONE_NUMBER_ID", "111"); setEnv("WHATSAPP_SHARED_ACCESS_TOKEN", "tok");
  const none = { whatsappPhoneNumberId: null, whatsappAccessToken: null };
  assert.deepEqual(whatsappSenderFor(none, { country: "IN" }), { phoneNumberId: "111", accessToken: "tok", shared: true });
  assert.equal(whatsappSenderFor(none, { country: "CA" }), null);
  assert.equal(whatsappSenderFor({ whatsappPhoneNumberId: "222", whatsappAccessToken: "own" }, { country: "IN" })?.shared, false);
  setEnv("WHATSAPP_SHARED_PHONE_NUMBER_ID", undefined);
  assert.equal(whatsappSenderFor(none, { country: "IN" }), null);
  setEnv("WHATSAPP_SHARED_ACCESS_TOKEN", undefined);
});

test("free replies only inside 24 hours of the customer's last message", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  assert.equal(windowOpen(new Date("2026-11-13T01:00:00Z"), now), true);
  assert.equal(windowOpen(new Date("2026-11-12T11:00:00Z"), now), false);
  assert.equal(windowOpen(null, now), false);
});
