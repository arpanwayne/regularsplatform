import { test } from "node:test";
import assert from "node:assert/strict";
import { marketingConsentFilter } from "../lib/consent";
import { formatDate, formatDateTime, localeFor } from "../lib/format";
import { verifyWebhookSignature } from "../lib/whatsapp";
import { verifyTwilioSignature } from "../lib/sms";

const setEnv = (k: string, v: string | undefined) => { const e = process.env as Record<string, string | undefined>; if (v === undefined) delete e[k]; else e[k] = v; };

test("Canadian marketing stops two years after the last dealing", () => {
  const now = new Date("2026-11-09T00:00:00Z");
  const cutoff = marketingConsentFilter("CA", now).lastSeenAt?.gte;
  assert.equal(cutoff?.toISOString().slice(0, 10), "2024-11-09");
  assert.deepEqual(marketingConsentFilter("IN", now), {});
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
