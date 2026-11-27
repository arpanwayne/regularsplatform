import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { notSentReason, offerParts, reasonSummary, sentOutcome } from "../lib/offers";
import { clientError } from "../lib/growth/client-error";
import { OWNER_UNREACHABLE } from "../lib/growth/brief";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("NEW 1: 'Sent' only when everyone got it; reasons are kept", () => {
  assert.equal(sentOutcome({ sentCount: 0, failedCount: 1 }), "FAILED");
  assert.equal(sentOutcome({ sentCount: 3, failedCount: 1 }), "PARTLY_SENT");
  assert.equal(sentOutcome({ sentCount: 3, failedCount: 0 }), "SENT");
  assert.equal(notSentReason(null), "WhatsApp not connected");
  assert.equal(notSentReason({ ok: false, status: "OPTED_OUT" }), "Customer said STOP");
  assert.equal(notSentReason({ ok: true, status: "NOT_SENT", segments: 0 }), "WhatsApp not connected and texting not set up");
  assert.equal(reasonSummary(new Map([["WhatsApp not connected", 1], ["Customer said STOP", 2]])), "Customer said STOP (2); WhatsApp not connected (1)");
  assert.match(read("app/dashboard/offers/page.tsx"), /sentOutcome\(o\)/);
});

test("NEW 2: the offers list shows the message, not a slice of 'Title (10% off): …'", () => {
  const p = offerParts({ message: "Shukriya first visit ke liye!", discountPercent: 10, freebie: false });
  assert.equal(p.extra, "10% off");
  assert.equal(p.body, "Shukriya first visit ke liye!");
  assert.doesNotMatch(read("app/dashboard/offers/page.tsx"), /slice\(o\.title\.length/);
});

test("NEW 3 + 4: clients see plain reasons, never server setting names", () => {
  assert.doesNotMatch(OWNER_UNREACHABLE, /[A-Z]+_[A-Z]+|Admin →/);
  const raw = "Text not sent: no WhatsApp sender (WHATSAPP_SHARED_PHONE_NUMBER_ID / WHATSAPP_SHARED_ACCESS_TOKEN); Twilio not set up (TWILIO_ACCOUNT_SID)";
  assert.doesNotMatch(clientError(raw), /[A-Z]+_[A-Z]+/);
  assert.match(clientError(raw), /WhatsApp isn't connected/);
  assert.match(clientError(null), /Retry/);
  assert.doesNotMatch(clientError("Weird failure GROWTH_SMS_FROM missing (Admin → assign one)"), /GROWTH_SMS_FROM|Admin/);
  assert.match(read("app/api/growth/actions/[id]/route.ts"), /"retry"/);
});

test("NEW 5: Growth AI copy is about Regulars (customers, visits), not quotes and jobs", () => {
  const page = read("app/dashboard/growth/page.tsx");
  assert.doesNotMatch(page, /quotes, jobs/);
  assert.match(page, /customers, their visits/);
});

test("check point: consent is checked again when an action is approved", () => {
  assert.match(read("lib/growth/executor.ts"), /!mayMarket\(c, business\.country, now\)/);
});

test("bug 10: the access token is not a password box (Chrome's login autofill)", () => {
  const form = read("components/locations-manager.tsx");
  assert.doesNotMatch(form, /name="whatsappAccessToken"\s+type="password"/);
  assert.match(read("app/dashboard/settings/page.tsx"), /isMetaPhoneNumberId/);
});
