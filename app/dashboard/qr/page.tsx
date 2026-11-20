import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { cleanTag, ensureJoinCode, joinText, qrTargetFor, smsJoinLink, whatsappJoinLink } from "@/lib/onboarding";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

/**
 * Dashboard → QR codes. One QR per location (counter / reception), plus
 * tagged ones (table 5, a stylist, a product shelf). Scanning opens WhatsApp —
 * or SMS for businesses that text by SMS — with "JOIN <code> <tag>" typed;
 * sending it makes them a customer who agreed to offers (lib/onboarding.ts).
 */
export default async function QrPage({ searchParams }: { searchParams: { tag?: string } }) {
  const business = await getCurrentBusiness();
  if (!business) return null;
  const tag = cleanTag(searchParams.tag);
  const locations = await prisma.location.findMany({ where: { businessId: business.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });

  const cards = await Promise.all(locations.map(async (location) => {
    const code = await ensureJoinCode(location);
    const target = await qrTargetFor(location, business);
    if (!target) return { location, code, target: null, link: null, svg: null };
    const link = target.kind === "WHATSAPP" ? whatsappJoinLink(target.number, code, tag) : smsJoinLink(target.number, code, tag);
    const svg = await QRCode.toString(link, { type: "svg", margin: 1, width: 240, errorCorrectionLevel: "M" });
    return { location, code, target, link, svg };
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">QR codes</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Put these at the counter, on tables or on the bill. A customer scans, presses Send, and joins your list with their
            permission for offers. No app, no form.
          </p>
        </div>
        <PrintButton />
      </div>

      <form className="flex flex-wrap items-center gap-2 text-sm print:hidden">
        <label htmlFor="tag" className="text-gray-600">Tag (optional, e.g. a table or a stylist):</label>
        <input id="tag" name="tag" defaultValue={tag ?? ""} placeholder="T5" className="w-32 rounded-input border border-control px-3 py-1.5" />
        <button className="rounded-full border border-control bg-white px-3 py-1.5 font-medium hover:bg-gray-50">Make QR</button>
        {tag && <a href="/dashboard/qr" className="text-brand-700 hover:text-brand-800">Clear tag</a>}
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ location, code, target, link, svg }) => (
          <div key={location.id} className="break-inside-avoid rounded-card border border-gray-200 bg-white p-4 text-center">
            <p className="font-semibold">{business.name}</p>
            {locations.length > 1 && <p className="text-sm text-gray-500">{location.name}</p>}
            {svg && link ? (
              <>
                <div className="mx-auto my-3 w-60" dangerouslySetInnerHTML={{ __html: svg }} />
                <p className="text-sm font-medium">Scan to get our offers on {target!.kind === "WHATSAPP" ? "WhatsApp" : "text"}</p>
                <p className="mt-1 text-xs text-gray-500">or send <span className="font-mono">{joinText(code, tag)}</span> to {target!.number}</p>
                <a href={link} className="mt-2 inline-block break-all text-xs text-brand-700 hover:text-brand-800 print:hidden">Test this link</a>
              </>
            ) : (
              <p className="my-6 text-sm text-gray-600">
                No WhatsApp or texting number is set up for this location yet, so there&apos;s nothing for the QR to open. Ask us to connect one.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
