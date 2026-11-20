import { getOwnerBusinessOrRedirect } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LocationsManager } from "@/components/locations-manager";
import { FrontDeskSettings } from "@/components/front-desk-settings";
import { sharedDisplayNumber, sharedSender, usesSharedNumber } from "@/lib/whatsapp-sender";
import { instagramAllowed } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const business = await getOwnerBusinessOrRedirect();
  if (!business) return null;

  const rows = await prisma.location.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
  });
  // Never send saved access tokens to the browser.
  const locations = rows.map((l) => ({
    ...l, whatsappAccessToken: null, hasWhatsappToken: !!l.whatsappAccessToken,
    instagramAccessToken: null, hasInstagramToken: !!l.instagramAccessToken,
  }));
  const sharedNumber = usesSharedNumber(business) && sharedSender() ? sharedDisplayNumber() : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <LocationsManager locations={locations} sharedNumber={sharedNumber} instagram={instagramAllowed(business)} />
      <FrontDeskSettings business={business} locations={locations} />
    </div>
  );
}
