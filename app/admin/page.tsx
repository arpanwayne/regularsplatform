import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [
    totalBusinesses,
    activeBusinesses,
    connectedToWhatsapp,
    totalCustomers,
    segmentCounts,
    callLogCounts,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { status: "ACTIVE" } }),
    prisma.business.count({ where: { whatsappPhoneNumberId: { not: null } } }),
    prisma.customer.count(),
    prisma.customer.groupBy({ by: ["segment"], _count: true }),
    prisma.callLog.groupBy({ by: ["status"], _count: true }),
  ]);

  const segments = Object.fromEntries(segmentCounts.map((s) => [s.segment, s._count]));
  const callLogs = Object.fromEntries(callLogCounts.map((c) => [c.status, c._count]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Platform overview</h1>
        <p className="text-sm text-gray-500">Aggregated across every business on Regulars.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Businesses" value={totalBusinesses} hint={`${activeBusinesses} active`} />
        <StatCard label="WhatsApp connected" value={connectedToWhatsapp} />
        <StatCard label="Total customers" value={totalCustomers} />
        <StatCard
          label="Calling scripts triggered"
          value={(callLogs.TRIGGERED ?? 0) + (callLogs.COMPLETED ?? 0)}
          hint={`${callLogs.PENDING ?? 0} pending (no voice provider connected)`}
        />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="font-medium">Customers by segment (all businesses)</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 p-4">
          {["NEW", "REGULAR", "AT_RISK", "HIGH_SPENDER", "DORMANT"].map((seg) => (
            <div key={seg}>
              <p className="text-xs text-gray-500">{seg.replace("_", " ")}</p>
              <p className="text-xl font-semibold">{segments[seg] ?? 0}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
