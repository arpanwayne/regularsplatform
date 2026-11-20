import { prisma } from "@/lib/prisma";
import { BusinessAdminTable } from "@/components/admin/business-admin-table";
import { businessWhere, currentPortal } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default async function AdminBusinessesPage() {
  const portal = currentPortal();
  const businesses = await prisma.business.findMany({
    where: businessWhere(portal),
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
        <h1 className="text-2xl font-semibold tracking-tight">{portal === "LOOPDESK" ? "Clients" : "Businesses"}</h1>
        <p className="text-sm text-gray-500">
          {portal === "LOOPDESK"
            ? "Clients with a bundle. Suspend a client or tune its follow-ups here; change the bundle in Bundles or Products & Bundles."
            : "Businesses on a Regulars plan. Suspend a business, change its plan, or override its segmentation thresholds."}
        </p>
      </div>
      <BusinessAdminTable businesses={rows} showPlan={portal === "REGULARS"} />
    </div>
  );
}
