import { test } from "node:test";
import assert from "node:assert/strict";
import { caslCutoff, marketingConsentFilter, mayMarket } from "../lib/consent";
import { formatDate, formatDateTime, localeFor } from "../lib/format";
import { verifyWebhookSignature } from "../lib/whatsapp";
import { verifyTwilioSignature } from "../lib/sms";

const setEnv = (k: string, v: string | undefined) => { const e = process.env as Record<string, string | undefined>; if (v === undefined) delete e[k]; else e[k] = v; };

test("Canadian marketing stops two years after the last dealing (implied consent only)", () => {
  const now = new Date("2026-11-09T00:00:00Z");
  assert.equal(caslCutoff("CA", now)?.toISOString().slice(0, 10), "2024-11-09");
  assert.equal(caslCutoff("IN", now), null);
  const old = new Date("2023-01-01T00:00:00Z");
  assert.equal(mayMarket({ lastSeenAt: old, consentStatus: "IMPLIED" }, "CA", now), false);
  assert.equal(mayMarket({ lastSeenAt: old, consentStatus: "GRANTED" }, "CA", now), true); // said YES / scanned the QR
  assert.equal(mayMarket({ lastSeenAt: old, consentStatus: "IMPLIED" }, "IN", now), true);
  // The Prisma filter: never PENDING / DECLINED; in Canada, GRANTED or seen within 2 years.
  assert.deepEqual(marketingConsentFilter("IN", now), { AND: [{ consentStatus: { notIn: ["PENDING", "DECLINED"] } }] });
  assert.deepEqual(marketingConsentFilter("CA", now).AND[1], { OR: [{ consentStatus: "GRANTED" }, { lastSeenAt: { gte: caslCutoff("CA", now) } }] });
});

test("nothing marketing goes to customers who haven't said YES or said NO", () => {
  const now = new Date();
  for (const country of ["IN", "CA"]) {
    assert.equal(mayMarket({ lastSeenAt: now, consentStatus: "PENDING" }, country, now), false);
    assert.equal(mayMarket({ lastSeenAt: now, consentStatus: "DECLINED" }, country, now), false);
    assert.equal(mayMarket({ lastSeenAt: now }, country, now), true); // rows from before this field
  }
});

test("dates follow the business's country and time zone, not the server's", () => {
  assert.equal(localeFor("IN"), "en-IN");
  const lateUtc = new Date("2026-11-09T22:00:00Z");
  assert.match(formatDate(lateUtc, "IN"), /10/); // already the 10th in India
  assert.match(formatDate(lateUtc, "CA"), /9/);
  assert.match(formatDateTime(lateUtc, "IN", "Asia/Kolkata"), /3:30/); // explicit zone wins
});

test("unsigned webhooks are refused on a live server, allowed on a dev machine", async () => {
  const env = process.env.NODE_ENV;
  setEnv("WHATSAPP_APP_SECRET", undefined); setEnv("TWILIO_AUTH_TOKEN", undefined);
  setEnv("NODE_ENV", "production");
  assert.equal(await verifyWebhookSignature("{}", null), false);
  assert.equal(verifyTwilioSignature("https://x", {}, null), false);
  setEnv("NODE_ENV", "development");
  assert.equal(await verifyWebhookSignature("{}", null), true);
  setEnv("NODE_ENV", env);
});
