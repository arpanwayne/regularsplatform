import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanTag, joinText, newJoinCode, parseConsentReply, parseJoin, parseStaffAdd, smsJoinLink, staffAddReply, whatsappJoinLink,
} from "../lib/onboarding";
import { approvalCheck, offerSummary, parseApprovalReply, parseSegments } from "../lib/offers";
import { parseOwnerReply } from "../lib/growth/brief";
import { getDef, renderTemplate } from "../lib/whatsapp-templates";

const limits = { approvalMaxDiscount: 10, approvalMaxAudience: 200, approvalAutoFreebie: false };

test("QR join codes are short, readable and found in the customer's message", () => {
  const code = newJoinCode(() => 0.5);
  assert.equal(code.length, 6);
  assert.doesNotMatch(newJoinCode(), /[01OIL]/); // no look-alike characters
  assert.equal(joinText("K7M2QX"), "JOIN K7M2QX");
  assert.equal(joinText("K7M2QX", "table 5"), "JOIN K7M2QX TABLE5");
  assert.deepEqual(parseJoin("JOIN K7M2QX T5"), { code: "K7M2QX", tag: "T5" });
  assert.deepEqual(parseJoin("hi! join k7m2qx"), { code: "K7M2QX", tag: null });
  assert.equal(parseJoin("I want to join the gym"), null); // "the" is not a code
  assert.equal(parseJoin("JOIN K7M2Q0"), null); // 0 is never in a code
  assert.equal(parseJoin(undefined), null);
  assert.equal(cleanTag("  t-5 !! "), "T-5");
  assert.equal(cleanTag(""), null);
});

test("QR links open WhatsApp or SMS with the JOIN text typed in", () => {
  assert.equal(whatsappJoinLink("+91 90414 36801", "K7M2QX", "T5"), "https://wa.me/919041436801?text=JOIN%20K7M2QX%20T5");
  assert.equal(smsJoinLink("+14165550123", "K7M2QX"), "sms:+14165550123?&body=JOIN%20K7M2QX");
});

test("YES / NO answers to the consent request, in English, Hinglish, Hindi and Punjabi", () => {
  for (const t of ["YES", "yes!", " Haan ji ", "haan", "ok", "Yes 👍", "हाँ", "ਹਾਂ"]) assert.equal(parseConsentReply(t), "GRANTED", t);
  for (const t of ["NO", "nahi", "Nahin.", "no thanks", "नहीं", "ਨਹੀਂ"]) assert.equal(parseConsentReply(t), "DECLINED", t);
  for (const t of ["what offers?", "yes please send the menu", "", "STOP"]) assert.equal(parseConsentReply(t), null, t);
});

test("staff can add a customer with 'add <name> <mobile>' in either order", () => {
  assert.deepEqual(parseStaffAdd("add Rahul Sharma 98765 43211", "IN"), { name: "Rahul Sharma", phone: "919876543211" });
  assert.deepEqual(parseStaffAdd("ADD +91-98140-12345 Simran", "IN"), { name: "Simran", phone: "919814012345" });
  assert.deepEqual(parseStaffAdd("add 416 555 2368", "CA"), { name: null, phone: "14165552368" });
  assert.ok("error" in (parseStaffAdd("add Rahul", "IN") as object));
  assert.ok("error" in (parseStaffAdd("add Rahul 9876543210", "IN") as object)); // placeholder number
  assert.equal(parseStaffAdd("address please?", "IN"), null);
  assert.equal(parseStaffAdd("hello", "IN"), null);
});

test("the staff member is told what happened in plain words", () => {
  const customer = { name: "Rahul", phone: "919876543211" } as never;
  assert.match(staffAddReply({ customer, outcome: "NEW_REQUESTED" }, "Glow Salon"), /YES or NO; offers start only after YES/);
  assert.match(staffAddReply({ customer, outcome: "DECLINED_BEFORE" }, "Glow Salon"), /won't ask again/);
});

test("a manager's offer needs the owner only when it is above the owner's limits", () => {
  const base = { discountPercent: 10, freebie: false, audienceCount: 200, byOwner: false, sector: "SALON" };
  assert.deepEqual(approvalCheck(base, limits), { auto: true, reasons: [] });
  assert.deepEqual(approvalCheck({ ...base, discountPercent: 20 }, limits).reasons, ["20% off is above the 10% limit"]);
  assert.deepEqual(approvalCheck({ ...base, audienceCount: 201 }, limits).reasons, ["201 customers is above the 200 limit"]);
  assert.equal(approvalCheck({ ...base, freebie: true }, limits).auto, false);
  assert.equal(approvalCheck({ ...base, freebie: true }, { ...limits, approvalAutoFreebie: true }).auto, true);
  assert.equal(approvalCheck({ ...base, sector: "CLINIC" }, limits).auto, false); // no automatic medical promotions
  assert.equal(approvalCheck({ ...base, discountPercent: 90, audienceCount: 5000, byOwner: true }, limits).auto, true); // the owner's own offer
  assert.equal(approvalCheck({ ...base, discountPercent: null, audienceCount: 1 }, { ...limits, approvalMaxAudience: 0 }).auto, false); // 0 = approve everything yourself
});

test("the owner's APPROVE / REJECT reply is read, and never clashes with the morning-plan reply", () => {
  assert.deepEqual(parseApprovalReply("APPROVE 7"), { decision: "APPROVE", no: 7 });
  assert.deepEqual(parseApprovalReply("reject #12."), { decision: "REJECT", no: 12 });
  assert.deepEqual(parseApprovalReply("Approve"), { decision: "APPROVE", no: null });
  assert.deepEqual(parseApprovalReply("haan 3"), { decision: "APPROVE", no: 3 });
  assert.deepEqual(parseApprovalReply("no 3"), { decision: "REJECT", no: 3 });
  // Morning plan replies stay the morning plan's:
  for (const t of ["1 3", "ALL", "skip", "no", "yes", "ok"]) assert.equal(parseApprovalReply(t), null, t);
  assert.ok(parseOwnerReply("no")); // still SKIP for the brief
  assert.equal(parseOwnerReply("approve 7"), null);
});

test("offer segments and the owner's one-line summary", () => {
  assert.deepEqual(parseSegments("at_risk, DORMANT,bogus,AT_RISK"), ["AT_RISK", "DORMANT"]);
  assert.deepEqual(parseSegments(["REGULAR"]), ["REGULAR"]);
  assert.deepEqual(parseSegments(null), []);
  const s = offerSummary({ title: "Weekend spa", message: "20% off\nhair spa", discountPercent: 20, freebie: false });
  assert.equal(s, "Weekend spa (20% off): 20% off hair spa");
  assert.doesNotMatch(s, /\n/);
});

test("the new WhatsApp templates read the way customers and owners will see them", () => {
  assert.equal(getDef("offer").category, "MARKETING");
  assert.equal(getDef("consent_request").category, "UTILITY");
  assert.equal(
    renderTemplate("owner_approval", "en", ["Glow Salon", "Simran", "120", "Weekend spa (20% off): 20% off hair spa", "7"]),
    "Approval needed for Glow Salon: Simran wants to send an offer to 120 customers. Offer: Weekend spa (20% off): 20% off hair spa Reply APPROVE 7 or REJECT 7 on this chat.",
  );
  assert.match(renderTemplate("consent_request", "hinglish", ["Priya", "Glow Salon"]), /YES likhein.*NO likhein/);
});
