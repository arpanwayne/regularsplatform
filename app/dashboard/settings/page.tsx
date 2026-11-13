import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LocationsManager } from "@/components/locations-manager";
import { FrontDeskSettings } from "@/components/front-desk-settings";
import { sharedDisplayNumber, sharedSender, usesSharedNumber } from "@/lib/whatsapp-sender";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

  const rows = await prisma.location.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
  });
  // Never send a saved WhatsApp access token to the browser.
  const locations = rows.map((l) => ({ ...l, whatsappAccessToken: null, hasWhatsappToken: !!l.whatsappAccessToken }));
  const sharedNumber = usesSharedNumber(business) && sharedSender() ? sharedDisplayNumber() : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <LocationsManager locations={locations} sharedNumber={sharedNumber} />
      <FrontDeskSettings business={business} locations={locations} />
    </div>
  );
}
