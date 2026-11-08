import { prisma } from "@/lib/prisma";
import { BundleAdminRow } from "@/components/admin/bundle-admin-row";
import { BUNDLE_PLANS, TOOL_META, isBundlePlan, planTools } from "@/lib/hub/plans";

export const dynamic = "force-dynamic";

/** Bundle A accounts: plan, paid period and the set-up state in every tool. */
export default async function AdminBundlesPage() {
  const rows = await prisma.business.findMany({
    where: { bundleStatus: { not: "NONE" } },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { name: true, email: true } }, toolAccounts: true },
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bundles</h1>
        <p className="text-sm text-gray-500">Activate a plan paid offline, re-run the automatic set-up, or issue fresh keys. Failed set-ups retry daily on their own.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr><th className="px-4 py-2 font-medium">Business</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 font-medium">Paid until</th><th className="px-4 py-2 font-medium">Tools</th><th className="px-4 py-2 font-medium"></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No bundle accounts yet. New ones come from /signup?plan=GROW.</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3"><p className="font-medium">{b.name}</p><p className="text-xs text-gray-500">{b.owner.name} · {b.owner.email} · {b.country}</p></td>
                <td className="px-4 py-3">{isBundlePlan(b.frontDeskPlan) ? BUNDLE_PLANS[b.frontDeskPlan].name : "—"}<p className="text-xs text-gray-500">{b.bundleStatus.replace("_", " ").toLowerCase()}</p></td>
                <td className="px-4 py-3">{b.bundlePaidUntil ? b.bundlePaidUntil.toLocaleDateString("en-CA") : "—"}</td>
                <td className="px-4 py-3">
                  <ul className="space-y-1">
                    {planTools(b.frontDeskPlan).map((t) => {
                      const a = b.toolAccounts.find((x) => x.tool === t);
                      return (
                        <li key={t} className="text-xs">
                          <span className="font-medium">{TOOL_META[t].name}</span>: {a ? a.status.toLowerCase() : "not started"}
                          {a?.externalId && <span className="text-gray-400"> · {a.externalId}</span>}
                          {a?.lastError && <span className="block text-red-600">{a.lastError}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </td>
                <td className="px-4 py-3"><BundleAdminRow id={b.id} plan={isBundlePlan(b.frontDeskPlan) ? b.frontDeskPlan : "ANSWER"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
