import { redirect } from "next/navigation";
import { currentPortal, portalUrl } from "@/lib/portal";
import { prisma } from "@/lib/prisma";
import { BundleAdminRow } from "@/components/admin/bundle-admin-row";
import { BUNDLE_PLANS, TOOL_META, currencyFor, isBundlePlan } from "@/lib/hub/plans";
import { businessTools } from "@/lib/hub/catalog-rules";
import { ManualSetupControl } from "@/components/admin/manual-setup-control";

export const dynamic = "force-dynamic";

/** Bundle A accounts: plan, paid period and the set-up state in every tool. */
export default async function AdminBundlesPage() {
  // Bundles live on the Loopdesk portal; from the Regulars address, go there.
  if (currentPortal() !== "LOOPDESK") redirect(portalUrl("LOOPDESK") ? `${portalUrl("LOOPDESK")}/admin/bundles` : "/admin");
  const rows = await prisma.business.findMany({
    where: { bundleStatus: { not: "NONE" } },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { name: true, email: true } }, toolAccounts: true,
      // Custom bundles (Products & Bundles): their manual software and its set-up state.
      customBundle: { select: { name: true, items: { select: { product: { select: { id: true, name: true, connect: true, url: true } } } } } },
      productSetups: true,
    },
  });
  const customBundles = await prisma.bundle.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, interval: true } });
  // Has each tool that reports events (WayneRing, CRM) ever used its key? (bug B3)
  const keyIds = rows.flatMap((b) => b.toolAccounts.map((a) => a.apiKeyId).filter(Boolean) as string[]);
  const keys = keyIds.length ? await prisma.apiKey.findMany({ where: { id: { in: keyIds } }, select: { id: true, lastUsedAt: true, revokedAt: true } }) : [];
  const keyBy = new Map(keys.map((k) => [k.id, k]));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bundles</h1>
        <p className="text-sm text-gray-500">Activate a plan or custom bundle paid offline, re-run the automatic set-up, issue fresh keys, or mark manual software ready. Failed set-ups retry daily on their own. Build bundles in Products &amp; Bundles.</p>
      </div>
      <div className="overflow-x-auto rounded-card border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr><th className="px-4 py-2 font-medium">Business</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 font-medium">Paid until</th><th className="px-4 py-2 font-medium">Tools</th><th className="px-4 py-2 font-medium"></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No bundle accounts yet. New ones come from /signup?plan=GROW.</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3"><p className="font-medium">{b.name}</p><p className="text-xs text-gray-500">{b.owner.name} · {b.owner.email} · {b.country}</p></td>
                <td className="px-4 py-3">{b.customBundle ? <>{b.customBundle.name}<span className="ml-1 rounded-full bg-brand-100 px-2 text-[11px] text-brand-900">custom</span></> : isBundlePlan(b.frontDeskPlan) ? BUNDLE_PLANS[b.frontDeskPlan].name : "—"}<p className="text-xs text-gray-500">{b.bundleStatus.replace("_", " ").toLowerCase()}</p></td>
                <td className="px-4 py-3">{b.bundlePaidUntil ? b.bundlePaidUntil.toLocaleDateString("en-CA") : "—"}</td>
                <td className="px-4 py-3">
                  <ul className="space-y-1">
                    {businessTools(b).map((t) => {
                      const a = b.toolAccounts.find((x) => x.tool === t);
                      return (
                        <li key={t} className="text-xs">
                          <span className="font-medium">{TOOL_META[t].name}</span>: {a ? a.status.toLowerCase() : "not started"}
                          {a?.externalId && <span className="text-gray-500"> · {a.externalId}</span>}
                          {a?.lastError && <span className="block text-red-600">{a.lastError}</span>}
                          {a?.apiKeyId && (() => {
                            const k = keyBy.get(a.apiKeyId);
                            if (!k || k.revokedAt) return <span className="block text-amber-700">Regulars key revoked — press New keys</span>;
                            return k.lastUsedAt
                              ? <span className="block text-gray-500">Last event to Regulars: {k.lastUsedAt.toLocaleString("en-CA")}</span>
                              : <span className="block text-amber-700">No events received yet — check this tool has the Regulars URL + key (see handover)</span>;
                          })()}
                        </li>
                      );
                    })}
                    {(b.customBundle?.items ?? []).map((i) => i.product).filter((p) => p.connect === "MANUAL").map((p) => {
                      const s = b.productSetups.find((x) => x.productId === p.id);
                      return (
                        <li key={p.id} className="text-xs">
                          <span className="font-medium">{p.name}</span> <span className="text-gray-500">(manual)</span>:{" "}
                          <ManualSetupControl businessId={b.id} productId={p.id} status={s?.status ?? "SETUP"} link={s?.link ?? null} />
                        </li>
                      );
                    })}
                  </ul>
                </td>
                <td className="px-4 py-3"><BundleAdminRow id={b.id} plan={b.customBundleId ? `custom:${b.customBundleId}` : isBundlePlan(b.frontDeskPlan) ? b.frontDeskPlan : "ANSWER"} currency={currencyFor(b.country)} customBundles={customBundles} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
