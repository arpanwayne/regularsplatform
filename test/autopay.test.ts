import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { handleRazorpayEvent, paidThrough, type AutopayStore } from "../lib/hub/autopay-events";

function fake() {
  const seen = new Set<string>();
  const log = { activated: [] as { plan: string; until?: Date }[], status: [] as string[], notified: 0 };
  const orders = new Map([["order_1", { businessId: "b1", plan: "GROW" }]]);
  const store: AutopayStore = {
    businessBySubscription: async (id) => (id === "sub_1" ? { id: "b1", autopayPlan: "GROW" } : null),
    recordCharge: async ({ paymentId }) => { if (seen.has(paymentId)) return false; seen.add(paymentId); return true; },
    claimOrder: async (id) => { const o = orders.get(id) ?? null; orders.delete(id); return o; },
    setAutopay: async (_b, s) => { log.status.push(s); },
    activate: async (_b, plan, o) => { log.activated.push({ plan, until: o.until }); },
    notifyOwner: async () => { log.notified++; },
  };
  return { store, log };
}
const charged = (pay: string, sub = "sub_1") => ({ event: "subscription.charged", payload: { subscription: { entity: { id: sub, current_end: 1800000000 } }, payment: { entity: { id: pay, amount: 54900, currency: "CAD" } } } });

test("a monthly charge extends the plan to the end of the cycle, plus a day", async () => {
  const { store, log } = fake();
  assert.equal(await handleRazorpayEvent(charged("pay_1"), store), "renewed");
  assert.equal(log.activated[0].plan, "GROW");
  assert.equal(log.activated[0].until?.getTime(), 1800000000 * 1000 + 86400000);
  assert.deepEqual(log.status, ["ON"]);
});

test("the same charge sent twice extends the plan once", async () => {
  const { store, log } = fake();
  await handleRazorpayEvent(charged("pay_1"), store);
  assert.equal(await handleRazorpayEvent(charged("pay_1"), store), "duplicate");
  assert.equal(log.activated.length, 1);
});

test("a subscription we don't know changes nothing", async () => {
  const { store, log } = fake();
  assert.equal(await handleRazorpayEvent(charged("pay_2", "sub_other"), store), "ignored");
  assert.equal(log.activated.length, 0);
});

test("a failed charge tells the owner but doesn't cut them off", async () => {
  const { store, log } = fake();
  assert.equal(await handleRazorpayEvent({ event: "subscription.halted", payload: { subscription: { entity: { id: "sub_1" } } } }, store), "failed");
  assert.deepEqual(log.status, ["FAILED"]);
  assert.equal(log.notified, 1);
  assert.equal(log.activated.length, 0);
});

test("cancelling turns autopay off", async () => {
  const { store, log } = fake();
  await handleRazorpayEvent({ event: "subscription.cancelled", payload: { subscription: { entity: { id: "sub_1" } } } }, store);
  assert.deepEqual(log.status, ["OFF"]);
});

test("someone who paid and closed the page still gets activated, once", async () => {
  const { store, log } = fake();
  const ev = { event: "payment.captured", payload: { payment: { entity: { id: "pay_9", order_id: "order_1" } } } };
  assert.equal(await handleRazorpayEvent(ev, store), "activated");
  assert.equal(await handleRazorpayEvent(ev, store), "ignored");
  assert.equal(log.activated.length, 1);
});

test("a subscription's own payment isn't treated as a one-time order", async () => {
  const { store, log } = fake();
  assert.equal(await handleRazorpayEvent({ event: "payment.captured", payload: { payment: { entity: { id: "pay_3", order_id: "order_from_razorpay" } } } }, store), "ignored");
  assert.equal(log.activated.length, 0);
});

test("a bad cycle date falls back to a normal period", () => {
  assert.equal(paidThrough(undefined), undefined);
  assert.equal(paidThrough(0), undefined);
});

test("webhook signatures are checked and refused when no secret is set", async () => {
  process.env.DATABASE_URL = "file:/tmp/x.db";
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
  const { verifyRazorpayWebhook } = await import("../lib/hub/autopay");
  const good = createHmac("sha256", "whsec").update("{}").digest("hex");
  assert.equal(verifyRazorpayWebhook("{}", good), true);
  assert.equal(verifyRazorpayWebhook('{"x":1}', good), false);
  assert.equal(verifyRazorpayWebhook("{}", null), false);
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  assert.equal(verifyRazorpayWebhook("{}", good), false);
});
