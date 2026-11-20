import { prisma } from "@/lib/prisma";
import { getCurrentMember } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { offerSummary } from "@/lib/offers";
import { OfferComposer } from "@/components/offer-composer";
import { OfferActions } from "@/components/offer-actions";
import { ApprovalLimitsForm } from "@/components/approval-limits-form";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: "Waiting for owner", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Approved, sending soon", cls: "bg-blue-100 text-blue-800" },
  SENDING: { label: "Sending", cls: "bg-blue-100 text-blue-800" },
  SENT: { label: "Sent", cls: "bg-green-100 text-green-800" },
  REJECTED: { label: "Rejected", cls: "bg-gray-100 text-gray-700" },
  EXPIRED: { label: "Expired (no answer in 48h)", cls: "bg-gray-100 text-gray-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-700" },
};

export default async function OffersPage() {
  const member = await getCurrentMember();
  if (!member) return null;
  const { business, user, isOwner } = member;
  const offers = await prisma.offer.findMany({
    where: { businessId: business.id },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const limits = { approvalMaxDiscount: business.approvalMaxDiscount, approvalMaxAudience: business.approvalMaxAudience, approvalAutoFreebie: business.approvalAutoFreebie };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Offers</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          {isOwner
            ? "Offers you write go out straight away. Your managers' offers go out on their own when they're inside your limits; bigger ones come to your WhatsApp for APPROVE or REJECT."
            : `Offers up to ${limits.approvalMaxDiscount}% off and ${limits.approvalMaxAudience} customers go out on their own${limits.approvalAutoFreebie ? "" : " (free items always need the owner)"}. Bigger ones go to the owner's WhatsApp for approval first.`}
          {" "}Offers go only to customers who can get them (joined by QR, said YES, or came to you themselves), in contact hours.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><OfferComposer isOwner={isOwner} limits={limits} /></div>
        {isOwner && <ApprovalLimitsForm limits={limits} sector={business.sector} />}
      </div>

      <div className="overflow-hidden rounded-card border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">Offer</th>
              <th className="px-4 py-2 font-medium">Customers</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {offers.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No offers yet.</td></tr>}
            {offers.map((o) => {
              const st = STATUS[o.status] ?? { label: o.status, cls: "bg-gray-100 text-gray-700" };
              return (
                <tr key={o.id} className="align-top">
                  <td className="px-4 py-3 text-gray-500">{o.approvalNo}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.title}</p>
                    <p className="text-gray-600">{offerSummary(o).slice(o.title.length + 2)}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      By {o.createdBy?.name ?? "a removed manager"}, {formatDateTime(o.createdAt, business.country)}
                      {o.segments ? ` · ${o.segments.split(",").map((s) => s.replace("_", " ").toLowerCase()).join(", ")}` : " · all customers"}
                      {o.sendAt ? ` · send after ${formatDateTime(o.sendAt, business.country)}` : ""}
                    </p>
                    {o.approvalReason && o.status === "PENDING_APPROVAL" && <p className="mt-1 text-xs text-amber-700">Needs the owner: {o.approvalReason}.</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{o.status === "SENT" ? `${o.sentCount} sent${o.failedCount ? `, ${o.failedCount} not sent` : ""}` : o.audienceCount}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                  <td className="px-4 py-3 text-right">
                    <OfferActions id={o.id} status={o.status} canDecide={isOwner} canCancel={isOwner || o.createdById === user.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
