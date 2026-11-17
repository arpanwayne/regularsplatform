// Instagram DMs → booking add-on (Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  HAS_REAL_PHONE, bookingReply, customerLabel, dmText, igPhone, instagramAllowed, instagramConnected,
  instagramWindowOpen, isBookingIntent, isInstagramOnly, sendCustomerInstagram, verifyInstagramSignature,
} from "../lib/instagram";
import { sendCustomerSms } from "../lib/sms";
import { sendCustomerWhatsApp } from "../lib/whatsapp-send";

const setEnv = (k: string, v: string | undefined) => { const e = process.env as Record<string, string | undefined>; if (v === undefined) delete e[k]; else e[k] = v; };

test("booking questions are recognised in English, Hinglish, Hindi and Punjabi", () => {
  for (const t of [
    "Hi, can I book a haircut for Saturday?", "Do you have any slots tomorrow?", "need an appointment pls",
    "Are you available on Monday?", "I want to schedule a visit", "appt for 2?",
    "kal ka slot milega?", "bhaiya appointment mil sakta hai", "kitne baje aa sakti hoon",
    "मुझे बुकिंग करनी है", "ਕੱਲ੍ਹ ਲਈ ਬੁੱਕ ਕਰਨਾ ਹੈ",
  ]) assert.equal(isBookingIntent(t), true, t);
  for (const t of ["Thanks, loved the service!", "What are your prices?", "ok", "", null, "👍"]) {
    assert.equal(isBookingIntent(t), false, String(t));
  }
});

test("the automatic reply carries the booking link in the business's language", () => {
  const url = "https://cal.com/maple-hvac";
  for (const lang of ["en", "hinglish", "hi", "pa"]) {
    const r = bookingReply(lang, "Maple HVAC", url);
    assert.ok(r.includes(url), lang);
    assert.ok(r.includes("Maple HVAC"), lang);
  }
  assert.match(bookingReply("en", "X", url), /book your slot/);
  assert.match(bookingReply("hinglish", "X", url), /book kar sakte/);
});

test("someone who only wrote on Instagram has no phone and is shown by @username", () => {
  const c = { name: null, phone: igPhone("1784001"), instagramUsername: "riya.k" };
  assert.equal(isInstagramOnly(c), true);
  assert.equal(isInstagramOnly({ phone: "919876500000" }), false);
  assert.equal(customerLabel(c), "@riya.k");
  assert.equal(customerLabel({ ...c, instagramUsername: null }), "Instagram user");
  assert.equal(customerLabel({ ...c, name: "Riya" }), "Riya");
  assert.equal(customerLabel({ name: null, phone: "14165551234" }), "+14165551234");
  assert.deepEqual(HAS_REAL_PHONE, { NOT: { phone: { startsWith: "ig:" } } });
});

test("photos and reel shares get a readable placeholder", () => {
  assert.equal(dmText({ mid: "m1", text: "hello" }), "hello");
  assert.equal(dmText({ mid: "m2", attachments: [{ type: "image" }] }), "[image]");
  assert.equal(dmText({ mid: "m3", is_unsupported: true }), "[unsupported message]");
  assert.equal(dmText({ mid: "m4" }), null);
});

test("webhook signatures are checked like WhatsApp's", async () => {
  const body = JSON.stringify({ object: "instagram", entry: [] });
  setEnv("INSTAGRAM_APP_SECRET", "s3cret");
  const good = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
  assert.equal(await verifyInstagramSignature(body, good), true);
  assert.equal(await verifyInstagramSignature(body, "sha256=" + "0".repeat(64)), false);
  assert.equal(await verifyInstagramSignature(body, null), false);
  setEnv("INSTAGRAM_APP_SECRET", undefined);
  setEnv("WHATSAPP_APP_SECRET", undefined);
  setEnv("NODE_ENV", "production");
  assert.equal(await verifyInstagramSignature(body, null), false, "no secret on a live server = refuse");
  setEnv("NODE_ENV", "test");
});

test("replies only inside Meta's 24-hour window", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  assert.equal(instagramWindowOpen(new Date("2026-11-17T01:00:00Z"), now), true);
  assert.equal(instagramWindowOpen(new Date("2026-11-16T11:00:00Z"), now), false);
  assert.equal(instagramWindowOpen(null, now), false);
});

test("the add-on is per business and per connected location", () => {
  assert.equal(instagramAllowed({ instagramAddon: true, status: "ACTIVE" }), true);
  assert.equal(instagramAllowed({ instagramAddon: false, status: "ACTIVE" }), false);
  assert.equal(instagramAllowed({ instagramAddon: true, status: "SUSPENDED" }), false);
  assert.equal(instagramConnected({ instagramAccountId: "1784", instagramAccessToken: "t" }), true);
  assert.equal(instagramConnected({ instagramAccountId: "1784", instagramAccessToken: null }), false);
});

const business = { id: "b1", status: "ACTIVE", country: "IN", name: "Maple" } as never;
const location = { id: "l1", status: "ACTIVE", name: "Main", smsFromNumber: "+14165550123", whatsappPhoneNumberId: "999", whatsappAccessToken: "tok", instagramAccountId: null, instagramAccessToken: null } as never;
const igOnly = { id: "c1", phone: igPhone("1784001"), optedOut: false, smsOptedOut: false, instagramId: "1784001" } as never;

test("an Instagram-only customer is never texted or WhatsApped", async () => {
  const sms = await sendCustomerSms({ business, location, customer: igOnly, body: "hi", purpose: "WINBACK" });
  assert.equal(sms.ok, false);
  assert.equal(sms.status, "NO_NUMBER");
  const wa = await sendCustomerWhatsApp({ business, location, customer: igOnly, purpose: "WINBACK", templateKey: "winback" as never });
  assert.equal(wa?.ok, false);
  assert.equal(wa?.status, "NO_NUMBER");
});

test("an Instagram reply needs a connected account", async () => {
  const r = await sendCustomerInstagram({ business, location, customer: igOnly, purpose: "REPLY", text: "hi" });
  assert.equal(r.ok, false);
  assert.match(String((r as { error?: string }).error), /^INSTAGRAM_NOT_CONNECTED/);
});

test("win-backs, reminders and Front Desk outreach leave Instagram-only customers out", () => {
  const planner = readFileSync("lib/growth/planner.ts", "utf8");
  assert.equal((planner.match(/\.\.\.HAS_REAL_PHONE/g) ?? []).length, 2, "SERVICE_DUE and WIN_BACK queries");
  assert.match(readFileSync("lib/front-desk.ts", "utf8"), /\.\.\.HAS_REAL_PHONE/);
  assert.match(readFileSync("app/api/calling-scripts/trigger/route.ts", "utf8"), /isInstagramOnly\(customer\)/);
});

// Meta's Unified login (the only set-up new Meta apps get since Oct 2026).
import { igGraph, igLogin, fetchInstagramUsername, refreshInstagramTokens, subscribeInstagramWebhooks } from "../lib/instagram";

type Call = { url: string; init?: RequestInit };
const fakeFetch = (calls: Call[], body: unknown, ok = true) =>
  (async (url: string, init?: RequestInit) => { calls.push({ url, init }); return { ok, status: ok ? 200 : 400, json: async () => body }; }) as unknown as typeof fetch;

test("Unified login is the default and uses graph.facebook.com; Instagram login stays available", () => {
  setEnv("INSTAGRAM_LOGIN", undefined);
  assert.equal(igLogin(), "unified");
  assert.match(igGraph(), /^https:\/\/graph\.facebook\.com\/v\d+\.\d+$/);
  setEnv("INSTAGRAM_LOGIN", "instagram");
  assert.equal(igLogin(), "instagram");
  assert.equal(igGraph(), "https://graph.instagram.com/v21.0");
  setEnv("INSTAGRAM_LOGIN", undefined);
});

test("the app is subscribed to the account's messages with its token", async () => {
  const calls: Call[] = [];
  const err = await subscribeInstagramWebhooks({ instagramAccountId: "17841400001", instagramAccessToken: "sys-token" }, fakeFetch(calls, { success: true }));
  assert.equal(err, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/17841400001\/subscribed_apps\?subscribed_fields=messages$/);
  assert.equal(calls[0].init?.method, "POST");
  assert.equal((calls[0].init?.headers as Record<string, string>).authorization, "Bearer sys-token");
  // Meta's error comes back readable.
  const bad = await subscribeInstagramWebhooks({ instagramAccountId: "1", instagramAccessToken: "t" }, fakeFetch([], { error: { message: "(#200) Missing permission instagram_manage_messages" } }, false));
  assert.match(String(bad), /instagram_manage_messages/);
  assert.match(String(await subscribeInstagramWebhooks({ instagramAccountId: null, instagramAccessToken: "t" })), /needed/);
});

test("usernames are looked up on the Unified login host", async () => {
  const calls: Call[] = [];
  const name = await fetchInstagramUsername({ instagramAccessToken: "sys" } as never, "9988", fakeFetch(calls, { username: "riya.k" }));
  assert.equal(name, "riya.k");
  assert.match(calls[0].url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/9988\?fields=username,name$/);
});

test("Unified login tokens aren't refreshed (they don't expire)", async () => {
  setEnv("INSTAGRAM_LOGIN", undefined);
  const r = await refreshInstagramTokens(new Date(), fakeFetch([], {}));
  assert.equal(r.checked, 0);
  assert.ok("skipped" in r);
});
