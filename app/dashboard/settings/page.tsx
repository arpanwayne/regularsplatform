import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LocationsManager } from "@/components/locations-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

  const locations = await prisma.location.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <LocationsManager locations={locations} />
    </div>
  );
}
