// Two portals on one app: Loopdesk (bundles) and Regulars (plans), Nov 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessWhere, portalForHost, portalOfBusiness, portalUrl } from "../lib/portal";

test("host decides the portal; ports, case and proxy lists don't matter", () => {
  delete process.env.PORTAL_OVERRIDE;
  delete process.env.LOOPDESK_HOSTS;
  assert.equal(portalForHost("app.loopdeskai.wayneesolutions.com"), "LOOPDESK");
  assert.equal(portalForHost("APP.loopdeskai.wayneesolutions.com:443"), "LOOPDESK");
  assert.equal(portalForHost("app.loopdeskai.wayneesolutions.com, 10.0.0.1"), "LOOPDESK");
  assert.equal(portalForHost("regulars.wayneesolutions.com"), "REGULARS");
  assert.equal(portalForHost("loopdeskai.wayneesolutions.com"), "REGULARS"); // marketing site is not the app
  assert.equal(portalForHost(null), "REGULARS");
  process.env.LOOPDESK_HOSTS = "app.loopdesk.com, localhost";
  assert.equal(portalForHost("localhost:3000"), "LOOPDESK");
  delete process.env.LOOPDESK_HOSTS;
  process.env.PORTAL_OVERRIDE = "loopdesk";
  assert.equal(portalForHost("regulars.wayneesolutions.com"), "LOOPDESK");
  delete process.env.PORTAL_OVERRIDE;
});

test("a business with a bundle is Loopdesk's, otherwise Regulars'", () => {
  assert.equal(portalOfBusiness({ bundleStatus: "ACTIVE" }), "LOOPDESK");
  assert.equal(portalOfBusiness({ bundleStatus: "PENDING_PAYMENT" }), "LOOPDESK");
  assert.equal(portalOfBusiness({ bundleStatus: "LAPSED" }), "LOOPDESK");
  assert.equal(portalOfBusiness({ bundleStatus: "NONE" }), "REGULARS");
  assert.deepEqual(businessWhere("LOOPDESK"), { bundleStatus: { not: "NONE" } });
  assert.deepEqual(businessWhere("REGULARS"), { bundleStatus: "NONE" });
});

test("portal URLs: Loopdesk needs its own, Regulars falls back to APP_URL", () => {
  delete process.env.LOOPDESK_APP_URL;
  delete process.env.REGULARS_APP_URL;
  process.env.APP_URL = "https://regulars.wayneesolutions.com/";
  assert.equal(portalUrl("LOOPDESK"), null);
  assert.equal(portalUrl("REGULARS"), "https://regulars.wayneesolutions.com");
  process.env.LOOPDESK_APP_URL = "https://app.loopdeskai.wayneesolutions.com";
  assert.equal(portalUrl("LOOPDESK"), "https://app.loopdeskai.wayneesolutions.com");
  delete process.env.LOOPDESK_APP_URL;
  delete process.env.APP_URL;
});

test("admin menu: bundle pages are Loopdesk-only and each panel has its own name", () => {
  const nav = readFileSync("components/admin-nav.tsx", "utf8");
  assert.match(nav, /"\/admin\/catalog".*only: "LOOPDESK"/);
  assert.match(nav, /"\/admin\/bundles".*only: "LOOPDESK"/);
  // Shared Loopdesk AI top bar: "<portal name> / Admin" (wordmark + tool name).
  assert.match(nav, /wordmark=\{portalName\}/);
  assert.match(nav, /toolName="Admin"/);
  assert.doesNotMatch(nav, /Regulars · Admin/);
  for (const page of ["app/admin/catalog/page.tsx", "app/admin/bundles/page.tsx"]) {
    assert.match(readFileSync(page, "utf8"), /currentPortal\(\) !== "LOOPDESK"/);
  }
  for (const page of ["app/admin/page.tsx", "app/admin/businesses/page.tsx", "app/admin/owners/page.tsx", "app/admin/usage/page.tsx", "app/admin/logs/page.tsx", "app/admin/api-keys/page.tsx"]) {
    assert.match(readFileSync(page, "utf8"), /businessWhere\(/, `${page} must list only its own portal's businesses`);
  }
});
