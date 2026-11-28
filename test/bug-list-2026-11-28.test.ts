import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSyncBody, isDummyPhone, mergeIncoming, syncPhone, toSyncCustomer, touchesSyncFields, type SyncCustomer } from "../lib/customer-sync-rules";
import { mobileProblem, oneDigitAway } from "../lib/phone";
import { discountMismatch, notSentReason } from "../lib/offers";
import { META_HOLD_WAIT_MS, clientError, retryBlockedUntil } from "../lib/growth/client-error";
import { customerParams } from "../lib/whatsapp-send";
import { parseStaffAdd } from "../lib/onboarding";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const inc = (o: Partial<SyncCustomer> = {}): SyncCustomer => ({
  phone: "919876000478", name: "pankaj sir", optedOut: false, optedOutAt: null, consentStatus: "GRANTED", consentSource: "QR",
  consentAt: "2026-11-28T05:00:00.000Z", joinTag: null, firstSeenAt: "2026-11-28T05:00:00.000Z", changedAt: "2026-11-28T05:00:00.000Z", ...o,
});
const local = (o: Record<string, unknown> = {}) => ({
  name: null, optedOut: false, consentStatus: "PENDING", consentSource: "MANAGER", consentAt: null, joinTag: null, syncChangedAt: null, ...o,
} as Parameters<typeof mergeIncoming>[0]);

test("A1/B5 sync: a customer added on the other side is created here", () => {
  const r = mergeIncoming(null, inc());
  assert.ok(r && "create" in r);
  assert.equal((r as { create: Record<string, unknown> }).create.consentStatus, "GRANTED");
  assert.equal((r as { create: Record<string, unknown> }).create.name, "pankaj sir");
});

test("A1 sync: STOP always wins and is never cleared by sync", () => {
  const stop = mergeIncoming(local({ consentStatus: "GRANTED" }), inc({ optedOut: true, optedOutAt: "2026-11-28T06:00:00.000Z" }));
  assert.deepEqual(stop && "update" in stop ? stop.update.optedOut : null, true);
  assert.equal(mergeIncoming(local({ optedOut: true, consentStatus: "GRANTED", consentSource: "QR", consentAt: new Date("2026-11-28T05:00:00Z"), name: "pankaj sir" }), inc({ optedOut: false })), null);
});

test("A1 sync: consent — an answer beats IMPLIED beats PENDING; a stale PENDING never undoes YES", () => {
  const up = mergeIncoming(local(), inc());
  assert.equal(up && "update" in up ? up.update.consentStatus : null, "GRANTED");
  const stale = mergeIncoming(local({ consentStatus: "GRANTED", name: "pankaj sir" }), inc({ consentStatus: "PENDING", changedAt: "2026-11-29T00:00:00.000Z" }));
  assert.equal(stale, null);
  const no = mergeIncoming(local({ consentStatus: "GRANTED", name: "pankaj sir", syncChangedAt: new Date("2026-11-28T05:00:00Z") }), inc({ consentStatus: "DECLINED", changedAt: "2026-11-28T07:00:00.000Z" }));
  assert.equal(no && "update" in no ? no.update.consentStatus : null, "DECLINED");
});

test("A1 sync: names fill gaps; a later edit wins, an older one doesn't", () => {
  const older = mergeIncoming(local({ name: "Pankaj", consentStatus: "GRANTED", syncChangedAt: new Date("2026-11-28T08:00:00Z") }), inc({ name: "pankaj sir" }));
  assert.equal(older, null);
  const later = mergeIncoming(local({ name: "Pankaj", consentStatus: "GRANTED", syncChangedAt: new Date("2026-11-28T04:00:00Z") }), inc({ name: "pankaj sir" }));
  assert.equal(later && "update" in later ? later.update.name : null, "pankaj sir");
});

test("A1/A4 sync: dummy 98000000xx and Instagram-only never travel; only synced fields mark a row", () => {
  assert.equal(isDummyPhone("+91 98000 00001"), true);
  assert.equal(isDummyPhone("919800000005"), true);
  assert.equal(isDummyPhone("919876000478"), false);
  assert.equal(syncPhone("ig:123456"), null);
  const base = { phone: "919800000003", name: "Rohit", optedOut: false, optedOutAt: null, consentStatus: "IMPLIED", consentSource: null, consentAt: null, joinTag: null, firstSeenAt: new Date(), syncChangedAt: null };
  assert.equal(toSyncCustomer(base), null);
  assert.equal(toSyncCustomer({ ...base, phone: "919876000478" })?.phone, "919876000478");
  const body = checkSyncBody({ customers: [inc(), inc({ phone: "919800000002" }), { phone: "x" }], messages: [{ id: "m1", phone: "919876000478", direction: "OUTBOUND", channel: "WHATSAPP", text: "hi", providerSid: "wamid.1", status: "SENT", purpose: "OTHER", createdAt: new Date().toISOString() }] });
  assert.equal(body.customers.length, 1);
  assert.equal(body.messages.length, 1);
  assert.equal(touchesSyncFields({ lastSeenAt: new Date() }), false);
  assert.equal(touchesSyncFields({ optedOut: true }), true);
  assert.match(read("lib/prisma.ts"), /\$use/);
});

test("B6: a message promising a different % than the discount box is caught", () => {
  assert.deepEqual(discountMismatch("First visit pe 20% discount paao", 10), [20]);
  assert.deepEqual(discountMismatch("10% off on hair spa", 10), []);
  assert.deepEqual(discountMismatch("20 percent off", 10), [20]);
  assert.deepEqual(discountMismatch("20% off", null), []);
  assert.match(read("app/api/offers/route.ts"), /DISCOUNT_MISMATCH/);
  assert.match(read("components/offer-composer.tsx"), /confirmMismatch/);
});

test("B8: country code + length checked; one-digit-away numbers flagged", () => {
  assert.notEqual(mobileProblem("56456546546"), null);
  assert.equal(mobileProblem("917087064479"), null);
  assert.equal(mobileProblem("14162544953"), null);
  assert.notEqual(mobileProblem("915087064479"), null);
  assert.notEqual(mobileProblem("919876543210"), null);
  assert.equal(oneDigitAway("917087064479", "917087066479"), true);
  assert.equal(oneDigitAway("917087064479", "917087064479"), false);
  assert.equal(oneDigitAway("917087064479", "917986032428"), false);
  assert.ok("error" in (parseStaffAdd("add test new +56456546546") ?? {}));
  assert.match(read("app/api/customers/route.ts"), /SIMILAR_NUMBER/);
});

test("B7: Meta's 'healthy ecosystem' error reads plainly and Retry waits", () => {
  const e = "This message was not delivered to maintain healthy ecosystem engagement.";
  assert.match(clientError(e), /WhatsApp ne abhi ye message rok diya/);
  const now = new Date("2026-11-28T06:00:00Z");
  assert.ok(retryBlockedUntil({ error: e, updatedAt: new Date("2026-11-28T05:00:00Z") }, now));
  assert.equal(retryBlockedUntil({ error: e, updatedAt: new Date(now.getTime() - META_HOLD_WAIT_MS - 1) }, now), null);
  assert.equal(retryBlockedUntil({ error: "WhatsApp not connected", updatedAt: now }, now), null);
  assert.match(notSentReason({ ok: false, status: "FAILED", error: "(#131049) healthy ecosystem" }), /held|WhatsApp refused/);
});

test("B9: the template's place slot is the business name, not the sender's personal name", () => {
  const loc = { name: "Main", smsSenderName: "Pavnoor Kaur", googleReviewUrl: null, bookingUrl: null } as unknown as Parameters<typeof customerParams>[3];
  const p = customerParams("winback", "hinglish", { name: "Neha" }, loc, { name: "Wayne E Solutions" });
  assert.equal(p[1], "Wayne E Solutions");
});

test("B10: Growth settings talk about bills and visits; quote / missed-call options only with those tools", () => {
  const src = read("components/growth-settings.tsx");
  assert.doesNotMatch(src, /Typical job value/);
  assert.match(src, /Average bill per visit/);
  assert.match(src, /jobs\.quotes &&/);
  assert.doesNotMatch(read("lib/growth/types.ts"), /their service is due/);
});

test("A3: Loopdesk can ask which business a Regulars QR code belongs to; its JOIN counts even if codes differ", () => {
  assert.match(read("app/api/hub/join-code/route.ts"), /consumeHubToken\(bearer\(req\.headers\.get\("authorization"\)\), "join-lookup"\)/);
  assert.match(read("lib/whatsapp-inbound.ts"), /p\.hubJoin === true/);
  assert.match(read("app/api/hub/whatsapp/inbound/route.ts"), /hubJoin: raw\.hubJoin === true/);
});

test("A1: sync endpoint and catch-up cron exist; B6 rewrite keeps the discount", async () => {
  assert.match(read("app/api/hub/sync/route.ts"), /"customer-sync"/);
  assert.match(read("app/api/cron/offers/route.ts"), /flushHubSync/);
  const { draftMismatchError, rewritePrompt } = await import("../lib/offer-ai");
  assert.match(String(draftMismatchError("20% off hair spa", "First Time Customer Offer", 10)), /20%.*10%/);
  assert.equal(draftMismatchError("10% off hair spa", "", 10), null);
  assert.match(rewritePrompt({ businessName: "W", language: "hinglish", draft: "10% off", discountPercent: 10 }), /exactly 10%/);
});
