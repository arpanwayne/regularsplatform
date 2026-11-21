import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [
    totalBusinesses,
    activeBusinesses,
    connectedLocations,
    totalCustomers,
    segmentCounts,
    callLogCounts,
    paidPayments,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { status: "ACTIVE" } }),
    prisma.location.count({ where: { whatsappPhoneNumberId: { not: null } } }),
    prisma.customer.count(),
    prisma.customer.groupBy({ by: ["segment"], _count: true }),
    prisma.callLog.groupBy({ by: ["status"], _count: true }),
    // Per currency, so CAD and INR payments are never added together.
    prisma.payment.groupBy({ by: ["currency"], where: { status: "PAID" }, _sum: { amountInPaise: true } }),
  ]);

  const segments = Object.fromEntries(segmentCounts.map((s) => [s.segment, s._count]));
  const callLogs = Object.fromEntries(callLogCounts.map((c) => [c.status, c._count]));
  const revenue = paidPayments
    .filter((p) => (p._sum.amountInPaise ?? 0) > 0)
    .map((p) => ((p._sum.amountInPaise ?? 0) / 100).toLocaleString(p.currency === "INR" ? "en-IN" : "en-CA", { style: "currency", currency: p.currency, maximumFractionDigits: 0 }))
    .join(" + ") || "₹0";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-gray-500">
          Every business on a Regulars plan (Starter, Growth, Pro).
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Businesses" value={totalBusinesses} hint={`${activeBusinesses} active`} />
        <StatCard label="Locations WhatsApp-connected" value={connectedLocations} />
        <StatCard label="Total customers" value={totalCustomers} />
        <StatCard
          label="Calling scripts triggered"
          value={(callLogs.TRIGGERED ?? 0) + (callLogs.COMPLETED ?? 0)}
          hint={`${callLogs.PENDING ?? 0} pending (no voice provider connected)`}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total revenue (paid)" value={revenue} hint="Plan payments from these businesses" />
      </div>

      <div className="rounded-card border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="font-medium">Customers by segment</h2>
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
