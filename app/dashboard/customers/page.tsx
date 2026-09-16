import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CustomerTable } from "@/components/customer-table";
import { Segment } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEGMENTS: Segment[] = ["REGULAR", "AT_RISK", "HIGH_SPENDER", "DORMANT", "NEW"];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { segment?: string };
}) {
  const business = await getCurrentBusiness();
  if (!business) return null;

  const segmentFilter = SEGMENTS.includes(searchParams.segment as Segment)
    ? (searchParams.segment as Segment)
    : undefined;

  const customers = await prisma.customer.findMany({
    where: { businessId: business.id, ...(segmentFilter ? { segment: segmentFilter } : {}) },
    orderBy: { lastSeenAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <FilterLink label="All" segment={undefined} active={!segmentFilter} />
        {SEGMENTS.map((s) => (
          <FilterLink key={s} label={s.replace("_", " ")} segment={s} active={segmentFilter === s} />
        ))}
      </div>
      <CustomerTable customers={customers} />
    </div>
  );
}

function FilterLink({
  label,
  segment,
  active,
}: {
  label: string;
  segment: string | undefined;
  active: boolean;
}) {
  const href = segment ? `/dashboard/customers?segment=${segment}` : "/dashboard/customers";
  return (
    <a
      href={href}
      className={`rounded-full px-3 py-1 text-sm font-medium transition ${
        active ? "bg-brand-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </a>
  );
}
