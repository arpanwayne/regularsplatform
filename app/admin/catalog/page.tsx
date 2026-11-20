import { redirect } from "next/navigation";
import { currentPortal, portalUrl } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { ensureCatalog } from "@/lib/hub/catalog";
import { BUNDLE_PLANS, BUNDLE_PLAN_IDS } from "@/lib/hub/plans";
import { CatalogManager } from "@/components/admin/catalog-manager";

export const dynamic = "force-dynamic";

/**
 * Products & Bundles: every product we sell, bundles built from any of them,
 * and giving a bundle to a client. See lib/hub/catalog.ts.
 */
export default async function AdminCatalogPage() {
  // Bundles live on the Loopdesk portal; from the Regulars address, go there.
  if (currentPortal() !== "LOOPDESK") redirect(portalUrl("LOOPDESK") ? `${portalUrl("LOOPDESK")}/admin/catalog` : "/admin");
  await ensureCatalog();
  const [products, bundles, businesses] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { bundles: true } } } }),
    prisma.bundle.findMany({ orderBy: { createdAt: "asc" }, include: { items: { select: { productId: true } }, businesses: { select: { id: true, name: true } } } }),
    prisma.business.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, country: true, bundleStatus: true, frontDeskPlan: true, customBundleId: true, bundlePaidUntil: true, owner: { select: { email: true } } },
    }),
  ]);
  const builtInPlans = BUNDLE_PLAN_IDS.map((id) => ({ id, name: BUNDLE_PLANS[id].name, tools: BUNDLE_PLANS[id].tools, priceInr: BUNDLE_PLANS[id].price.INR, priceCad: BUNDLE_PLANS[id].price.CAD }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Products &amp; Bundles</h1>
        <p className="text-sm text-gray-500">
          Add every product we sell, build a bundle from any of them, and give it to a client. Connected software is set up
          automatically; manual software shows on the client&apos;s home page until our team marks it ready (Admin → Bundles).
        </p>
      </div>
      <CatalogManager
        products={products.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description, url: p.url, connect: p.connect, hubTool: p.hubTool, priceInr: p.priceInr, priceCad: p.priceCad, builtIn: p.builtIn, active: p.active, sortOrder: p.sortOrder, bundleCount: p._count.bundles }))}
        bundles={bundles.map((b) => ({ id: b.id, name: b.name, description: b.description, priceInr: b.priceInr, priceCad: b.priceCad, interval: b.interval, growthManager: b.growthManager, smsMonthlyLimit: b.smsMonthlyLimit, active: b.active, productIds: b.items.map((i) => i.productId), clients: b.businesses }))}
        builtInPlans={builtInPlans}
        businesses={businesses.map((b) => ({ id: b.id, name: b.name, country: b.country, email: b.owner.email, bundleStatus: b.bundleStatus, frontDeskPlan: b.frontDeskPlan, customBundleId: b.customBundleId, paidUntil: b.bundlePaidUntil?.toISOString() ?? null }))}
      />
    </div>
  );
}
