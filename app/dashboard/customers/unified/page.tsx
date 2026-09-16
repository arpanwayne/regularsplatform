import Link from "next/link";
import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SegmentBadge } from "@/components/segment-badge";
import { computeSegment, computeSpendPercentileThreshold, DEFAULT_THRESHOLDS } from "@/lib/segmentation";

export const dynamic = "force-dynamic";

// Cross-location view: groups a business's customers by phone number so a
// chain can see one person's total behavior across every branch, without
// merging the underlying per-location Customer rows (each location still
// needs its own row for local segmentation/calling-scripts — see
// prisma/schema.prisma). This page is read-only and purely additive.
export default async function UnifiedCustomersPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

  const customers = await prisma.customer.findMany({
    where: { businessId: business.id },
    include: { location: { select: { name: true } } },
  });

  const byPhone = new Map<string, typeof customers>();
  for (const c of customers) {
    const list = byPhone.get(c.phone) ?? [];
    list.push(c);
    byPhone.set(c.phone, list);
  }

  const spendThreshold = computeSpendPercentileThreshold(
    Array.from(byPhone.values()).map((rows) => rows.reduce((sum, r) => sum + r.totalSpend, 0))
  );

  const unified = Array.from(byPhone.entries())
    .map(([phone, rows]) => {
      const totalVisits = rows.reduce((sum, r) => sum + r.visitCount, 0);
      const totalSpend = rows.reduce((sum, r) => sum + r.totalSpend, 0);
      const lastSeenAt = new Date(Math.max(...rows.map((r) => r.lastSeenAt.getTime())));
      const firstSeenAt = new Date(Math.min(...rows.map((r) => r.firstSeenAt.getTime())));
      const name = rows.find((r) => r.name)?.name ?? null;
      const locations = rows.map((r) => r.location.name);
      const optedOut = rows.every((r) => r.optedOut);
      const unifiedSegment = computeSegment(
        { visitCount: totalVisits, totalSpend, lastSeenAt, firstSeenAt },
        spendThreshold,
        DEFAULT_THRESHOLDS
      );
      return { phone, name, totalVisits, totalSpend, lastSeenAt, locations, optedOut, unifiedSegment };
    })
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());

  const multiLocationCustomers = unified.filter((u) => u.locations.length > 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Unified customers (all locations)</h1>
          <p className="text-sm text-gray-500">
            {multiLocationCustomers.length} customer{multiLocationCustomers.length === 1 ? "" : "s"} ne
            ek se zyada location visit ki hai.
          </p>
        </div>
        <Link href="/dashboard/customers" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Per-location view
        </Link>
      </div>

      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        Yeh segment sirf is page ke liye combined stats se calculate hota hai — calling scripts abhi
        bhi per-location segment use karte hain (Customers page se), kyunki wahi actual outreach
        location-specific hoti hai.
      </div>

      {unified.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
          Abhi tak koi customer capture nahi hua.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Locations visited</th>
                <th className="px-4 py-2 font-medium">Unified segment</th>
                <th className="px-4 py-2 font-medium">Total visits</th>
                <th className="px-4 py-2 font-medium">Total spend</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {unified.map((u) => (
                <tr key={u.phone}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.name || "Unnamed"}</p>
                    <p className="text-gray-500">{u.phone}</p>
                    {u.optedOut && (
                      <span className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Opted out
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.locations.join(", ")}</td>
                  <td className="px-4 py-3">
                    <SegmentBadge segment={u.unifiedSegment} />
                  </td>
                  <td className="px-4 py-3">{u.totalVisits}</td>
                  <td className="px-4 py-3">₹{u.totalSpend.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.lastSeenAt.toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
