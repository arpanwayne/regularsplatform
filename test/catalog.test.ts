// Products & Bundles: custom bundles built from the catalog (Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUILT_IN_PRODUCTS, STARTER_PRODUCTS, businessTools, decodeTools, encodeTools, periodDays, priceLine,
  slugify, suggestedPrice, toolsFromProducts,
} from "../lib/hub/catalog-rules";
import { growthAllowed } from "../lib/growth/access";
import { TOOLS } from "../lib/hub/plans";

test("every built-in tool is in the catalog exactly once, plus Regulars as the hub", () => {
  const tools = BUILT_IN_PRODUCTS.filter((p) => p.connect === "AUTO").map((p) => p.hubTool);
  assert.deepEqual([...tools].sort(), [...TOOLS].sort());
  assert.equal(BUILT_IN_PRODUCTS.filter((p) => p.connect === "HUB").length, 1);
  const keys = [...BUILT_IN_PRODUCTS, ...STARTER_PRODUCTS].map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length, "keys are unique");
  // Korvo is still manual; Loyvexa connects automatically since Nov 2026.
  assert.equal(STARTER_PRODUCTS.find((p) => p.key === "korvo")?.connect, "MANUAL");
  assert.equal(BUILT_IN_PRODUCTS.find((p) => p.key === "loyvexa")?.hubTool, "LOYVEXA");
  assert.equal(STARTER_PRODUCTS.find((p) => p.key === "loyvexa"), undefined);
});

test("a custom bundle with Loyvexa sets up Loyvexa; the built-in Front Desk plans never do", () => {
  assert.deepEqual(toolsFromProducts([{ connect: "HUB", hubTool: null }, { connect: "AUTO", hubTool: "LOYVEXA" }, { connect: "MANUAL", hubTool: null }]), ["LOYVEXA"]);
  assert.deepEqual(businessTools({ customBundleId: "b1", bundleTools: "LOYVEXA,WAYNERING", frontDeskPlan: null }), ["WAYNERING", "LOYVEXA"]);
  for (const plan of ["ANSWER", "ANSWER_RETURN", "GROW"]) assert.ok(!businessTools({ customBundleId: null, bundleTools: "", frontDeskPlan: plan }).includes("LOYVEXA"));
});

test("a bundle's connected tools are its AUTO products only, in the standard order", () => {
  const products = [
    { connect: "MANUAL", hubTool: null }, // Korvo
    { connect: "AUTO", hubTool: "GMB" },
    { connect: "HUB", hubTool: null }, // Regulars
    { connect: "AUTO", hubTool: "WAYNERING" },
    { connect: "AUTO", hubTool: "VIDEO", active: false }, // switched off in the catalog
    { connect: "AUTO", hubTool: "NOT_A_TOOL" },
  ];
  assert.deepEqual(toolsFromProducts(products), ["WAYNERING", "GMB"]);
});

test("tools are stored on the business and read back safely", () => {
  assert.equal(encodeTools(["WAYNERING", "GMB"]), "WAYNERING,GMB");
  assert.deepEqual(decodeTools("GMB,WAYNERING"), ["WAYNERING", "GMB"]);
  assert.deepEqual(decodeTools("GMB,,junk,GMB"), ["GMB"]);
  assert.deepEqual(decodeTools(""), []);
  assert.deepEqual(decodeTools(null), []);
});

test("a custom bundle replaces the built-in plan's tools; without one the plan still decides", () => {
  assert.deepEqual(businessTools({ customBundleId: "b1", bundleTools: "GMB", frontDeskPlan: "GROW" }), ["GMB"]);
  assert.deepEqual(businessTools({ customBundleId: "b1", bundleTools: "", frontDeskPlan: null }), []);
  assert.deepEqual(businessTools({ customBundleId: null, bundleTools: "", frontDeskPlan: "ANSWER" }), ["WAYNERING"]);
  assert.deepEqual(businessTools({ customBundleId: null, bundleTools: "GMB", frontDeskPlan: "GROW" }), ["WAYNERING", "FIELD_SERVICE", "GMB", "VIDEO"]);
});

test("the Growth Manager follows the custom bundle's own setting", () => {
  const base = { plan: "STARTER", frontDeskPlan: null, bundleStatus: "ACTIVE" };
  assert.equal(growthAllowed({ ...base, customBundleId: "b1", bundleGrowth: true }), true);
  assert.equal(growthAllowed({ ...base, customBundleId: "b1", bundleGrowth: false }), false);
  assert.equal(growthAllowed({ ...base, bundleStatus: "LAPSED", customBundleId: "b1", bundleGrowth: true }), false);
  // Built-in plans unchanged.
  assert.equal(growthAllowed({ plan: "STARTER", frontDeskPlan: "GROW", bundleStatus: "ACTIVE" }), true);
  assert.equal(growthAllowed({ plan: "STARTER", frontDeskPlan: "ANSWER", bundleStatus: "ACTIVE" }), false);
});

test("prices, periods and keys", () => {
  assert.equal(periodDays("MONTHLY"), 30);
  assert.equal(periodDays("YEARLY"), 365);
  assert.equal(priceLine({ priceInr: 14999, priceCad: null }), "₹14,999 / month");
  assert.equal(priceLine({ priceInr: 99999, priceCad: 1999, interval: "YEARLY" }), "₹99,999 / year · C$1999 / year");
  assert.equal(priceLine({ priceInr: null, priceCad: null }), "No price set");
  assert.deepEqual(suggestedPrice([{ priceInr: 5000, priceCad: null }, { priceInr: 3000, priceCad: null }]), { priceInr: 8000, priceCad: null });
  assert.equal(slugify("Order Desk"), "order-desk");
  assert.equal(slugify("  Korvo++ (v2) "), "korvo-v2");
  assert.equal(slugify("!!!"), "product");
});

test("provisioning, one-login, nav and the win-back cron use the custom bundle too", () => {
  assert.match(readFileSync("lib/hub/provision.ts", "utf8"), /businessTools\(biz\)/);
  assert.match(readFileSync("app/api/hub/open/[tool]/route.ts", "utf8"), /businessTools\(business\)/);
  assert.match(readFileSync("app/dashboard/layout.tsx", "utf8"), /businessTools\(business\)/);
  assert.match(readFileSync("app/api/cron/winback/route.ts", "utf8"), /bundleGrowth: true/);
  // A built-in plan clears a custom bundle, so the two can't both apply.
  assert.match(readFileSync("lib/hub/bundle.ts", "utf8"), /customBundleId: null/);
});
