import { test } from "node:test";
import assert from "node:assert/strict";
import { jwtVerify } from "jose";
import { hubAnswer, signToolToken } from "../lib/whatsapp-hub";
import { toWaMessage } from "../lib/whatsapp-inbound";
import { hubWhatsAppReady, loopdeskApiUrl, whatsappSenderFor } from "../lib/whatsapp-sender";

const SECRET = "x".repeat(40);

test("retest 27 Nov: bundle clients send through Loopdesk (one number for the whole bundle)", () => {
  const prev = { ...process.env };
  process.env.HUB_SECRET = SECRET;
  process.env.LOOPDESK_API_URL = "https://app.loopdeskai.example/";
  delete process.env.WHATSAPP_SHARED_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_SHARED_ACCESS_TOKEN;
  try {
    assert.equal(loopdeskApiUrl(), "https://app.loopdeskai.example");
    assert.ok(hubWhatsAppReady());
    const noOwn = { whatsappPhoneNumberId: null, whatsappAccessToken: null };
    // Bundle client, no own number, no WhatsApp keys on this server → through Loopdesk.
    assert.deepEqual(whatsappSenderFor(noOwn, { country: "IN", hubBusinessId: "hub1" }), { phoneNumberId: "", accessToken: "", shared: true, hubBusinessId: "hub1" });
    // Works for a bundle client outside India too (the bundle's number decides, not the country).
    assert.equal(whatsappSenderFor(noOwn, { country: "CA", hubBusinessId: "hub1" })?.hubBusinessId, "hub1");
    // Its own connected number still wins.
    assert.equal(whatsappSenderFor({ whatsappPhoneNumberId: "123", whatsappAccessToken: "t" }, { country: "IN", hubBusinessId: "hub1" })?.hubBusinessId, undefined);
    // Standalone Regulars client: not through Loopdesk; no shared keys here → none.
    assert.equal(whatsappSenderFor(noOwn, { country: "IN", hubBusinessId: null }), null);
    // Loopdesk not configured → not through Loopdesk.
    delete process.env.LOOPDESK_API_URL;
    assert.equal(whatsappSenderFor(noOwn, { country: "IN", hubBusinessId: "hub1" }), null);
  } finally {
    process.env = prev;
  }
});

test("tool token is what Loopdesk's gateway checks (iss regulars, aud regulars-hub, purpose, sub)", async () => {
  const t = await signToolToken("hub1", "whatsapp-send", SECRET);
  const { payload } = await jwtVerify(t, new TextEncoder().encode(SECRET), { issuer: "regulars", audience: "regulars-hub", algorithms: ["HS256"], maxTokenAge: "3m" });
  assert.equal(payload.sub, "hub1");
  assert.equal(payload.purpose, "whatsapp-send");
  assert.ok(typeof payload.jti === "string" && payload.jti.length > 10);
});

test("Loopdesk answers map to send results; Meta's code is kept so template fallback still works", () => {
  assert.deepEqual(hubAnswer(200, { messageId: "wamid.1" }), { ok: true, id: "wamid.1" });
  const r = hubAnswer(502, { error: { code: "WHATSAPP_FAILED", message: "Template name does not exist", metaCode: 132001 } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 132001);
  assert.match(r.error ?? "", /Template name does not exist \(WHATSAPP_FAILED\)/);
  assert.match(hubAnswer(409, { error: { code: "OPTED_OUT", message: "This person sent STOP to the business" } }).error ?? "", /STOP/);
});

test("messages forwarded by Loopdesk become Meta-shaped messages", () => {
  assert.deepEqual(toWaMessage({ from: "917087064479", id: "w1", text: "YES" })?.text, { body: "YES" });
  const raw = toWaMessage({ from: "917087064479", id: "w2", type: "button", button: { text: "Yes" }, profileName: "Mandeep" });
  assert.equal(raw?.type, "button");
  assert.equal(raw?.button?.text, "Yes");
  assert.equal((raw as unknown as Record<string, unknown>).profileName, undefined);
  assert.equal(toWaMessage({ id: "x" }), null);
});
