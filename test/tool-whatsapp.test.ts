import { test } from "node:test";
import assert from "node:assert/strict";
import { checkToolMessage, isOtpTemplate, pickInboundOwner, ToolWaError, waDigits } from "../lib/hub/tool-whatsapp";

test("a tool may send plain text or a named template, to one clean number", () => {
  const t = checkToolMessage({ to: "+91 98140-00101", message: { type: "text", text: { body: "Aapke 800 points hain" } } });
  assert.equal(t.to, "919814000101"); assert.equal(t.kind, "text");
  const tpl = checkToolMessage({ to: "919814000101", message: { type: "template", template: { name: "loyvexa_otp", language: { code: "en" }, components: [{ type: "body", parameters: [{ type: "text", text: "123456" }] }] } } });
  assert.equal(tpl.templateName, "loyvexa_otp");
  assert.deepEqual(Object.keys(tpl.message), ["type", "template"]); // nothing else (no "to", no sender) passes through
  for (const bad of [
    { to: "123", message: { type: "text", text: { body: "x" } } },
    { to: "919814000101", message: { type: "image", image: { link: "x" } } },
    { to: "919814000101", message: { type: "template", template: { name: "Bad Name!" } } },
    { to: "919814000101", message: { type: "text", text: { body: "  " } } },
  ]) assert.throws(() => checkToolMessage(bad), ToolWaError);
});

test("STOP blocks everything from a tool except OTP codes", () => {
  assert.equal(isOtpTemplate("loyvexa_otp"), true);
  assert.equal(isOtpTemplate("loyvexa_ai_slab"), false);
  assert.equal(isOtpTemplate(null), false);
  assert.equal(waDigits("+91 (981) 400-0101"), "919814000101");
});

test("a reply goes to whoever wrote to that person last: the tool or Regulars", () => {
  const t = (s: string) => new Date(`2026-11-20T${s}:00Z`);
  assert.equal(pickInboundOwner({ lastOutboundAt: t("10:00"), createdAt: t("09:00") }, null), true);
  assert.equal(pickInboundOwner({ lastOutboundAt: t("10:00"), createdAt: t("09:00") }, t("09:30")), true);
  assert.equal(pickInboundOwner({ lastOutboundAt: t("10:00"), createdAt: t("09:00") }, t("11:00")), false);
});
