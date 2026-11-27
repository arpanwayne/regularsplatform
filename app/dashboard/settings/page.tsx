import { getOwnerBusinessOrRedirect } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LocationsManager } from "@/components/locations-manager";
import { FrontDeskSettings } from "@/components/front-desk-settings";
import { BusinessNameForm } from "@/components/business-name-form";
import { hubSender, isMetaPhoneNumberId, sharedDisplayNumber, sharedSender, usesSharedNumber } from "@/lib/whatsapp-sender";
import { logEvent } from "@/lib/logger";
import { instagramAllowed } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const business = await getOwnerBusinessOrRedirect();
  if (!business) return null;

  let rows = await prisma.location.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
  });
  // Retest 27 Nov 2026, bug 17: a browser-autofilled email saved as the Phone number ID
  // (from before the digits-only check) is never a real number — clear it and its token
  // so the location falls back to the shared / bundle number, instead of only warning.
  const bad = rows.filter((l) => l.whatsappPhoneNumberId && !isMetaPhoneNumberId(l.whatsappPhoneNumberId));
  if (bad.length) {
    await prisma.location.updateMany({ where: { id: { in: bad.map((l) => l.id) } }, data: { whatsappPhoneNumberId: null, whatsappAccessToken: null } });
    await logEvent({ businessId: business.id, source: "WHATSAPP", level: "WARN", message: "Cleared a wrong value saved as WhatsApp Phone number ID (not digits)", meta: { locations: bad.map((l) => l.name) } });
    rows = rows.map((l) => (bad.some((b) => b.id === l.id) ? { ...l, whatsappPhoneNumberId: null, whatsappAccessToken: null } : l));
  }
  // Never send saved access tokens to the browser.
  const locations = rows.map((l) => ({
    ...l, whatsappAccessToken: null, hasWhatsappToken: !!l.whatsappAccessToken,
    instagramAccessToken: null, hasInstagramToken: !!l.instagramAccessToken,
  }));
  // Bundle clients use the bundle's number through Loopdesk; others the shared number on this server.
  const sharedNumber = hubSender(business.hubBusinessId) || (usesSharedNumber(business) && sharedSender()) ? sharedDisplayNumber() : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <BusinessNameForm
        name={business.name}
        linked={!!business.hubBusinessId}
        senderNames={rows.filter((l) => l.smsSenderName && l.smsSenderName.trim() !== business.name).map((l) => ({ location: l.name, sender: l.smsSenderName!.trim() }))}
      />
      <LocationsManager locations={locations} sharedNumber={sharedNumber} instagram={instagramAllowed(business)} />
      <FrontDeskSettings business={business} locations={locations} />
    </div>
  );
}
