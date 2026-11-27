import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/stat-card";
import { SegmentBadge } from "@/components/segment-badge";
import { RunSegmentationButton } from "@/components/run-segmentation-button";
import { formatDateTime } from "@/lib/format";
import { sharedSender, usesSharedNumber } from "@/lib/whatsapp-sender";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

  const [segmentCounts, totalCustomers, recentCallLogs, connectedLocationCount, recentScripts] = await Promise.all([
    prisma.customer.groupBy({
      by: ["segment"],
      where: { businessId: business.id },
      _count: true,
    }),
    prisma.customer.count({ where: { businessId: business.id } }),
    prisma.callLog.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: true },
    }),
    prisma.location.count({ where: { businessId: business.id, whatsappPhoneNumberId: { not: null } } }),
    // Bug 8 (27 Nov 2026): scripts made on the Customers page are activity too, not only calls.
    prisma.callingScript.findMany({
      where: { businessId: business.id, isDefault: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, customerId: true, createdAt: true },
    }),
  ]);
  const scriptCustomers = await prisma.customer.findMany({
    where: { businessId: business.id, id: { in: recentScripts.map((s) => s.customerId).filter((id): id is string => !!id) } },
    select: { id: true, name: true, phone: true },
  });
  const customerById = new Map(scriptCustomers.map((c) => [c.id, c]));
  const activity = [
    ...recentCallLogs.map((log) => ({ id: `call:${log.id}`, who: log.customer.name || log.customer.phone, what: `Call · ${log.status}`, at: log.createdAt })),
    ...recentScripts.map((sc) => {
      const c = sc.customerId ? customerById.get(sc.customerId) : null;
      return { id: `script:${sc.id}`, who: c ? c.name || `+${c.phone}` : sc.title, what: c ? `Script · ${sc.title}` : "Script", at: sc.createdAt };
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 6);
  // Connected = a location has its own number, or the business sends from the shared number.
  const hasWhatsappConfig = connectedLocationCount > 0 || (usesSharedNumber(business) && !!sharedSender());

  const countBySegment = Object.fromEntries(segmentCounts.map((s) => [s.segment, s._count]));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-gray-500">{business.name} · {business.sector}</p>
        </div>
        <RunSegmentationButton />
      </div>

      {!hasWhatsappConfig && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          WhatsApp isn&apos;t connected yet. Set up the webhook in{" "}
          <a href="/dashboard/settings" className="font-medium underline">
            Settings
          </a>{" "}
          to start capturing customers.
        </div>
      )}

      {/* Every segment has a card, so the cards add up to the total (bug B11: "New" was missing). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total customers" value={totalCustomers} />
        <StatCard label="New" value={countBySegment.NEW ?? 0} />
        <StatCard label="Regular" value={countBySegment.REGULAR ?? 0} />
        <StatCard label="At-risk" value={countBySegment.AT_RISK ?? 0} />
        <StatCard label="High spender" value={countBySegment.HIGH_SPENDER ?? 0} />
        <StatCard label="Dormant" value={countBySegment.DORMANT ?? 0} />
      </div>

      <div className="rounded-card border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="font-medium">Recent AI calling activity</h2>
        </div>
        {activity.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            No calling scripts yet. Generate one for a customer on the Customers page.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.who}</p>
                  <p className="text-gray-500">{formatDateTime(a.at, business.country)}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-gray-500">{a.what}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
