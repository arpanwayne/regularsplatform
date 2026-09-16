import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/stat-card";
import { SegmentBadge } from "@/components/segment-badge";
import { RunSegmentationButton } from "@/components/run-segmentation-button";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

  const [segmentCounts, totalCustomers, recentCallLogs, connectedLocationCount] = await Promise.all([
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
  ]);
  const hasWhatsappConfig = connectedLocationCount > 0;

  const countBySegment = Object.fromEntries(segmentCounts.map((s) => [s.segment, s._count]));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-gray-500">{business.name} · {business.sector}</p>
        </div>
        <RunSegmentationButton />
      </div>

      {!hasWhatsappConfig && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          WhatsApp abhi tak connect nahi hai — passive data capture start karne ke liye{" "}
          <a href="/dashboard/settings" className="font-medium underline">
            Settings
          </a>{" "}
          mein webhook configure karo.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total customers" value={totalCustomers} />
        <StatCard label="Regular" value={countBySegment.REGULAR ?? 0} />
        <StatCard label="At-risk" value={countBySegment.AT_RISK ?? 0} />
        <StatCard label="High spender" value={countBySegment.HIGH_SPENDER ?? 0} />
        <StatCard label="Dormant" value={countBySegment.DORMANT ?? 0} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="font-medium">Recent AI calling activity</h2>
        </div>
        {recentCallLogs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            Abhi tak koi calling script trigger nahi hua. Customers page se kisi customer ke
            liye script generate karo.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentCallLogs.map((log) => (
              <li key={log.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{log.customer.name || log.customer.phone}</p>
                  <p className="text-gray-500">{new Date(log.createdAt).toLocaleString("en-IN")}</p>
                </div>
                <span className="text-xs font-medium text-gray-500">{log.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
