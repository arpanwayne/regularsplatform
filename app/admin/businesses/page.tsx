import { prisma } from "@/lib/prisma";
import { BusinessAdminTable } from "@/components/admin/business-admin-table";

export const dynamic = "force-dynamic";

export default async function AdminBusinessesPage() {
  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { customers: true, callLogs: true, locations: true } },
      locations: { select: { whatsappPhoneNumberId: true } },
    },
  });

  const rows = businesses.map((b) => ({
    ...b,
    connectedLocations: b.locations.filter((l) => l.whatsappPhoneNumberId).length,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Businesses</h1>
        <p className="text-sm text-gray-500">
          Suspend a business, change its plan, or override its segmentation thresholds.
        </p>
      </div>
      <BusinessAdminTable businesses={rows} />
    </div>
  );
}
