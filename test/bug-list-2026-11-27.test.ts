// Fixes from "Regulars – Full Bug List" (tested 27 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasOwnWhatsApp, isMetaPhoneNumberId, whatsappSenderFor } from "../lib/whatsapp-sender";
import { verifyWhatsAppNumber } from "../lib/whatsapp-verify";
import { phoneVariants } from "../lib/hub-rules";
import { WA_TEMPLATE_DEFS, templateName } from "../lib/whatsapp-templates";
import { loopdeskVideoStudioUrl } from "../lib/offer-media";
import { OWNER_NOT_INBOX } from "../lib/staff";

const read = (p: string) => readFileSync(p, "utf8");
const setEnv = (k: string, v: string | undefined) => { const e = process.env as Record<string, string | undefined>; if (v === undefined) delete e[k]; else e[k] = v; };

test("bug 1: Loopdesk opt-outs land here (phone spellings, route, purpose)", () => {
  assert.deepEqual(phoneVariants("917087064479").sort(), ["+917087064479", "07087064479", "7087064479", "917087064479"].sort());
  assert.deepEqual(phoneVariants("12"), []);
  const route = read("app/api/hub/opt-out/route.ts");
  assert.match(route, /consumeHubToken\(bearer\(req\.headers\.get\("authorization"\)\), "opt-out"\)/);
  assert.match(route, /body\.hubBusinessId !== claims\.sub/);
  assert.match(route, /optedOut: !body\.optedOut/);
  assert.match(read("lib/hub-rules.ts"), /HubPurpose = "provision" \| "sso" \| "opt-out"/);
});

test("bugs 2 + 10: an autofilled email in Phone number ID is never used to send", () => {
  setEnv("WHATSAPP_SHARED_PHONE_NUMBER_ID", "111"); setEnv("WHATSAPP_SHARED_ACCESS_TOKEN", "tok");
  const bad = { whatsappPhoneNumberId: "pankaj@wayneesolutions.com", whatsappAccessToken: "password123" };
  assert.equal(isMetaPhoneNumberId(bad.whatsappPhoneNumberId), false);
  assert.equal(hasOwnWhatsApp(bad), false);
  assert.equal(whatsappSenderFor(bad, { country: "IN" })?.shared, true);
  assert.equal(whatsappSenderFor({ whatsappPhoneNumberId: "109876543210123", whatsappAccessToken: "EAAG" }, { country: "IN" })?.shared, false);
  setEnv("WHATSAPP_SHARED_PHONE_NUMBER_ID", undefined); setEnv("WHATSAPP_SHARED_ACCESS_TOKEN", undefined);
  const form = read("components/locations-manager.tsx");
  // Retest 27 Nov 2026: the token box is masked text, not type="password" (Chrome treated it as a login form).
  assert.match(form, /WebkitTextSecurity/);
  assert.match(form, /whatsappDisconnect: true/);
  assert.match(read("components/team-manager.tsx"), /type="password" autoComplete="new-password"/);
});

test("bug 17: Meta is asked before a number is saved", async () => {
  const ok = await verifyWhatsAppNumber("109876543210123", "EAAG", (async () => new Response(JSON.stringify({ display_phone_number: "+91 98140 00101" }), { status: 200 })) as typeof fetch);
  assert.deepEqual(ok, { ok: true, displayNumber: "+91 98140 00101" });
  const bad = await verifyWhatsAppNumber("109876543210123", "bad", (async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }), { status: 400 })) as typeof fetch);
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /token is wrong or expired \(Meta 190\)/);
  const api = read("app/api/locations/[id]/route.ts");
  assert.match(api, /verifyWhatsAppNumber\(phoneId, token\)/);
  assert.match(api, /regex\(\/\^\\d\{6,25\}\$\//);
});

test("bugs 4 + 5 + 6: QR join is handled before owner / staff routing; owners are told why", () => {
  const hook = read("lib/whatsapp-inbound.ts") /* moved out of the webhook so Loopdesk-forwarded messages run the same code */;
  const at = hook.indexOf("const joining =");
  assert.ok(at > 0 && hook.indexOf("handleStaffMessage(location") > at && hook.indexOf("handleOwnerReply(location") > at);
  assert.match(hook, /if \(fromOwner && !joining\)/);
  assert.match(hook, /if \(joining && qrJoin\)/);
  assert.match(OWNER_NOT_INBOX, /Inbox/);
});

test("bug 7: Loopdesk clients open Video Studio through Loopdesk's one login", () => {
  assert.equal(loopdeskVideoStudioUrl(false), null);
  assert.equal(loopdeskVideoStudioUrl(true, "https://app.loopdeskai.wayneesolutions.com/"), "https://app.loopdeskai.wayneesolutions.com/api/hub/open/video?page=make");
  assert.match(read("app/dashboard/offers/page.tsx"), /loopdeskVideoStudioUrl\(!!business\.hubBusinessId\)/);
});

test("bugs 8 + 15: scripts are linked to the customer, shown on Overview, not duplicated", () => {
  assert.match(read("prisma/schema.prisma"), /customerId String\?/);
  const gen = read("app/api/calling-scripts/generate/route.ts");
  assert.match(gen, /customerId: customer\.id, isDefault: false, createdAt: \{ gte:/);
  assert.match(gen, /reused: true/);
  assert.match(read("app/dashboard/page.tsx"), /prisma\.callingScript\.findMany/);
  assert.match(read("components/customer-table.tsx"), /if \(generating\.current\) return;/);
});

test("bug 9: the business name is editable and used in messages", () => {
  assert.match(read("app/api/business/route.ts"), /name: z\.string\(\)\.trim\(\)\.min\(2/);
  assert.match(read("app/dashboard/settings/page.tsx"), /<BusinessNameForm/);
});

test("bug 11: new managers get the manager_welcome template", () => {
  const def = WA_TEMPLATE_DEFS.find((d) => d.key === "manager_welcome");
  assert.ok(def);
  assert.equal(def!.audience, "owner");
  assert.equal(templateName("manager_welcome", "en"), "loopdesk_manager_welcome");
  assert.match(read("app/api/team/route.ts"), /templateKey: "manager_welcome"/);
});

test("bug 12: phone layout — customer cards, scrolling tables", () => {
  const t = read("components/customer-table.tsx");
  assert.match(t, /className="space-y-3 md:hidden"/);
  assert.match(t, /hidden overflow-x-auto rounded-card border border-gray-200 bg-white md:block/);
  assert.match(read("app/dashboard/offers/page.tsx"), /overflow-x-auto/);
});

test("bug 13: Loopdesk clients don't fill tool IDs by hand", () => {
  assert.match(read("app/dashboard/growth/page.tsx"), /managed=\{!!business\.hubBusinessId\}/);
  assert.match(read("components/growth-settings.tsx"), /connected in Loopdesk AI/);
});

test("bug 16: a customer who never wrote isn't told 'more than 24 hours'", () => {
  assert.match(read("components/inbox-reply.tsx"), /hasn&apos;t written to you on WhatsApp yet/);
  assert.match(read("app/dashboard/inbox/page.tsx"), /neverWrote=\{/);
});
