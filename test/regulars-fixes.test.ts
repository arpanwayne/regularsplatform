import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListDate } from "../lib/csv";
import { failureReason, waErrorText } from "../lib/whatsapp-sender";
import { formatDateTime } from "../lib/format";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

test("CSV last_visit dates are read day-first in India and Canada", () => {
  assert.equal(ymd(parseListDate("15/10/2026", "IN")), "2026-10-15");
  assert.equal(ymd(parseListDate("05/10/2026", "IN")), "2026-10-05"); // 5 Oct, not 10 May
  assert.equal(ymd(parseListDate("5-10-26", "IN")), "2026-10-05");
  assert.equal(ymd(parseListDate("15.10.2026", "CA")), "2026-10-15");
  assert.equal(ymd(parseListDate("2026-10-15", "IN")), "2026-10-15");
  assert.equal(ymd(parseListDate("10/15/2026", "IN")), "2026-10-15"); // clearly month-first
  assert.equal(ymd(parseListDate("05/10/2026", "US")), "2026-05-10");
  assert.equal(ymd(parseListDate("15 Oct 2026", "IN")), "2026-10-15");
  assert.equal(parseListDate("31/02/2026", "IN"), null);
  assert.equal(parseListDate("yesterday", "IN"), null);
  assert.equal(parseListDate("", "IN"), null);
});

test("WhatsApp failure reasons are readable, incl. 131049", () => {
  assert.match(waErrorText(131049), /marketing messages/);
  assert.match(waErrorText(131049), /Meta 131049/);
  assert.equal(waErrorText(999, "Something odd"), "Something odd (Meta 999)");
  assert.match(failureReason(JSON.stringify({ template: "x", deliveryError: { code: 131049, title: "x" } }))!, /131049/);
  assert.match(failureReason(JSON.stringify({ error: "Bad token", errorCode: 190 }))!, /Bad token \(Meta 190\)/);
  assert.equal(failureReason(JSON.stringify({ template: "x", error: null })), null);
  assert.equal(failureReason("not json"), null);
});

test("Indian businesses see IST times, not UTC", () => {
  const t = new Date("2026-11-16T07:46:00Z"); // 13:16 IST
  assert.match(formatDateTime(t, "IN"), /1:16\s?pm/i);
});
