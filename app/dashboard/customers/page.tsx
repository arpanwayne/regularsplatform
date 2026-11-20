import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CustomerTable } from "@/components/customer-table";
import { Segment } from "@/lib/types";
import { AddCustomerForm } from "@/components/add-customer-form";
import { CsvImport } from "@/components/front-desk-settings";

export const dynamic = "force-dynamic";

const SEGMENTS: Segment[] = ["REGULAR", "AT_RISK", "HIGH_SPENDER", "DORMANT", "NEW"];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { segment?: string };
}) {
  const member = await getCurrentMember();
  if (!member) return null;
  const { business } = member;

  const segmentFilter = SEGMENTS.includes(searchParams.segment as Segment)
    ? (searchParams.segment as Segment)
    : undefined;

  const [customers, locations] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId: business.id, ...(segmentFilter ? { segment: segmentFilter } : {}) },
      orderBy: { lastSeenAt: "desc" },
      include: { location: { select: { name: true } } },
    }),
    prisma.location.findMany({ where: { businessId: business.id }, select: { id: true, name: true, status: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const locationCount = locations.length;
  const activeLocations = locations.filter((l) => l.status === "ACTIVE");
  const pendingConsent = customers.filter((c) => c.consentStatus === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        {locationCount > 1 && (
          <Link
            href="/dashboard/customers/unified"
            className="text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            View unified across locations →
          </Link>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AddCustomerForm locations={activeLocations} />
        <div className="rounded-card border border-gray-200 bg-white p-4">
          <CsvImport locations={activeLocations} country={business.country} />
        </div>
      </div>
      {pendingConsent > 0 && (
        <p className="text-sm text-gray-600">{pendingConsent} customer{pendingConsent === 1 ? " hasn't" : "s haven't"} answered the YES/NO request yet. They get no offers until they say YES.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <FilterLink label="All" segment={undefined} active={!segmentFilter} />
        {SEGMENTS.map((s) => (
          <FilterLink key={s} label={s.replace("_", " ")} segment={s} active={segmentFilter === s} />
        ))}
      </div>
      <CustomerTable customers={customers} showLocation={locationCount > 1} country={business.country} bundle={business.bundleStatus !== "NONE" || !member.isOwner} />
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
        active ? "bg-brand-600 text-white" : "bg-white border border-control text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </a>
  );
}
