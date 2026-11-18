import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { getSettings } from "@/lib/growth/settings";
import { provisionBusiness } from "@/lib/hub/provision";
import { BUILT_IN_PRODUCTS, STARTER_PRODUCTS, encodeTools, periodDays, toolsFromProducts } from "@/lib/hub/catalog-rules";

export * from "@/lib/hub/catalog-rules";

const DAY = 86400000;

/**
 * Products & Bundles (Admin → Products & Bundles).
 *
 *  - The catalog lists every product we sell. Built-in tools (WayneRing, CRM,
 *    GMB, Video Studio, Loyvexa) connect automatically; others (Korvo, new
 *    ones) are MANUAL until they get the hub's provisioning + single sign-on.
 *  - A bundle is any set of products with its own price.
 *  - Giving a bundle to a client works like the built-in plans: one paid
 *    period, the AUTO tools are set up straight away, MANUAL ones appear on
 *    the client's home page as "Setting up" until our team marks them ready.
 */

/** Creates the built-in and starter catalog rows if they're missing. Safe to call on every page view. */
export async function ensureCatalog() {
  const switched: string[] = [];
  for (const p of BUILT_IN_PRODUCTS) {
    const before = await prisma.product.findUnique({ where: { key: p.key }, select: { connect: true, hubTool: true } });
    const row = await prisma.product.upsert({
      where: { key: p.key },
      // Only on first creation; an existing row keeps the name / price our team edited.
      create: { ...p, builtIn: true },
      // How a built-in connects is code; keep it right even if a row was edited.
      update: { connect: p.connect, hubTool: p.hubTool, builtIn: true },
    });
    // A product that just became automatic (Loyvexa, Nov 2026): every bundle
    // with it must recompute its tools, so its clients get set up.
    if (before && (before.connect !== p.connect || before.hubTool !== p.hubTool)) switched.push(row.id);
  }
  if (switched.length) {
    const bundles = await prisma.bundleProduct.findMany({ where: { productId: { in: switched } }, select: { bundleId: true } });
    for (const bundleId of Array.from(new Set(bundles.map((b) => b.bundleId)))) {
      await syncBundle(bundleId).catch((err) => logEvent({ source: "BILLING", level: "ERROR", message: "Bundle re-sync after a product became automatic failed", meta: { bundleId, error: err instanceof Error ? err.message : String(err) } }));
    }
  }
  for (const p of STARTER_PRODUCTS) {
    const exists = await prisma.product.findUnique({ where: { key: p.key }, select: { id: true } });
    if (!exists) await prisma.product.create({ data: { ...p, builtIn: false } });
  }
}

async function bundleWithProducts(bundleId: string) {
  return prisma.bundle.findUnique({ where: { id: bundleId }, include: { items: { include: { product: true } } } });
}

/** Make sure every MANUAL product in the bundle has a set-up row for this client. */
async function ensureSetups(businessId: string, productIds: string[]) {
  for (const productId of productIds) {
    await prisma.productSetup.upsert({
      where: { businessId_productId: { businessId, productId } },
      create: { businessId, productId },
      update: {},
    });
  }
  // Put back into the bundle after being taken out: our team checks it again.
  if (productIds.length) {
    await prisma.productSetup.updateMany({ where: { businessId, productId: { in: productIds }, status: "PAUSED" }, data: { status: "SETUP" } });
  }
}

/**
 * Gives a client a custom bundle (or renews it). Replaces any built-in plan.
 * Paying again before the end extends from the current end date.
 */
export async function activateCustomBundle(businessId: string, bundleId: string, opts: { days?: number; reason: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const [biz, bundle] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    bundleWithProducts(bundleId),
  ]);
  if (!bundle) throw new Error("Bundle not found");
  const products = bundle.items.map((i) => i.product);
  const from = biz.bundlePaidUntil && biz.bundlePaidUntil > now && biz.customBundleId === bundleId ? biz.bundlePaidUntil : now;
  const paidUntil = new Date(from.getTime() + (opts.days ?? periodDays(bundle.interval)) * DAY);

  await prisma.business.update({
    where: { id: businessId },
    data: {
      customBundleId: bundle.id,
      bundleTools: encodeTools(toolsFromProducts(products)),
      bundleGrowth: bundle.growthManager,
      frontDeskPlan: null,
      bundleStatus: "ACTIVE",
      bundlePaidUntil: paidUntil,
      smsMonthlyLimit: bundle.smsMonthlyLimit,
    },
  });
  await getSettings(biz);
  await prisma.growthSettings.update({ where: { businessId }, data: { enabled: bundle.growthManager } });
  await ensureSetups(businessId, products.filter((p) => p.connect === "MANUAL").map((p) => p.id));
  await logEvent({ businessId, source: "BILLING", level: "INFO", message: `Custom bundle "${bundle.name}" active until ${paidUntil.toISOString().slice(0, 10)} (${opts.reason})` });
  const tools = await provisionBusiness(businessId);
  return { paidUntil, tools };
}

/**
 * After a bundle is edited (software added/removed, Growth Manager on/off),
 * every client on it gets the change: their tool list is updated, new
 * connected tools are set up, removed ones are paused (never deleted), and
 * new manual products appear on their home page.
 */
export async function syncBundle(bundleId: string) {
  const bundle = await bundleWithProducts(bundleId);
  if (!bundle) return { businesses: 0 };
  const products = bundle.items.map((i) => i.product);
  const tools = encodeTools(toolsFromProducts(products));
  const manualIds = products.filter((p) => p.connect === "MANUAL").map((p) => p.id);
  const clients = await prisma.business.findMany({ where: { customBundleId: bundleId }, select: { id: true, bundleStatus: true } });
  for (const c of clients) {
    await prisma.business.update({ where: { id: c.id }, data: { bundleTools: tools, bundleGrowth: bundle.growthManager, smsMonthlyLimit: bundle.smsMonthlyLimit } });
    if (c.bundleStatus === "ACTIVE") {
      await prisma.growthSettings.updateMany({ where: { businessId: c.id }, data: { enabled: bundle.growthManager } });
    }
    await ensureSetups(c.id, manualIds);
    // Software taken out of the bundle: pause its manual set-up (kept, not deleted).
    await prisma.productSetup.updateMany({ where: { businessId: c.id, productId: { notIn: manualIds }, status: { not: "PAUSED" } }, data: { status: "PAUSED" } });
    await provisionBusiness(c.id).catch(() => []);
  }
  return { businesses: clients.length };
}

/** What a client's home page shows for a custom bundle. */
export async function customBundleView(businessId: string) {
  const biz = await prisma.business.findUnique({
    where: { id: businessId },
    select: { customBundle: { include: { items: { include: { product: true } } } }, productSetups: true },
  });
  const bundle = biz?.customBundle;
  if (!bundle) return null;
  const products = bundle.items.map((i) => i.product).sort((a, b) => a.sortOrder - b.sortOrder);
  const manual = products
    .filter((p) => p.connect === "MANUAL" && p.active)
    .map((p) => ({ product: p, setup: biz!.productSetups.find((s) => s.productId === p.id) ?? null }));
  return { bundle, products, tools: toolsFromProducts(products), manual };
}

/** Every bundle includes Regulars (the hub: login, inbox, customers, billing). */
export async function withHub(productIds: string[]) {
  const hub = await prisma.product.findFirst({ where: { connect: "HUB" }, select: { id: true } });
  const ids = new Set(productIds);
  if (hub) ids.add(hub.id);
  const found = await prisma.product.findMany({ where: { id: { in: Array.from(ids) } }, select: { id: true } });
  return found.map((p) => p.id);
}
