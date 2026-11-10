import { getCurrentBusiness } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { BillingCheckout } from "@/components/billing-checkout";
import { BundleCheckout } from "@/components/bundle-checkout";
import { RENEWAL_REMINDER_WINDOW_DAYS } from "@/lib/billing";
import { BUNDLE_PLANS, GRACE_DAYS, currencyFor, isBundlePlan } from "@/lib/hub/plans";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

  // ── Bundle A: one bill for every tool ──────────────────────────────────
  if (isBundlePlan(business.frontDeskPlan) && business.bundleStatus !== "NONE") {
    const payments = await prisma.payment.findMany({ where: { businessId: business.id, kind: "BUNDLE" }, orderBy: { createdAt: "desc" }, take: 12 });
    const until = business.bundlePaidUntil;
    const days = until ? Math.ceil((until.getTime() - Date.now()) / 86400000) : null;
    const plan = BUNDLE_PLANS[business.frontDeskPlan];
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Billing</h1>
          <p className="text-sm text-gray-500">
            {business.bundleStatus === "PENDING_PAYMENT" && `One payment sets up everything in ${plan.name}: your AI receptionist, follow-ups${plan.tools.length > 1 ? ", CRM and Google profile" : ""}.`}
            {business.bundleStatus === "ACTIVE" && until && `${plan.name} is paid until ${formatDate(until, business.country)}.`}
            {business.bundleStatus === "LAPSED" && "Your plan has ended and your tools are paused. Nothing has been deleted — pay to switch everything back on."}
          </p>
        </div>
        {business.bundleStatus === "ACTIVE" && days !== null && days <= RENEWAL_REMINDER_WINDOW_DAYS && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {days <= 0 ? `Your plan ended ${-days} day(s) ago. Tools stay on for ${GRACE_DAYS} days after the end date, then pause.` : (business.autopayStatus === "ON" ? `Your plan renews automatically in ${days} day(s).` : `Your plan ends in ${days} day(s). Turn on automatic payment or pay below to keep it running.`)}
          </div>
        )}
        {business.autopayStatus === "FAILED" && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            We couldn&apos;t charge your card. Turn automatic payment off and on again with a working card, or pay once below, to keep your tools running.
          </div>
        )}
        <BundleCheckout currentPlan={business.frontDeskPlan} status={business.bundleStatus} currency={currencyFor(business.country)} autopay={business.autopayStatus} autopayPlan={business.autopayPlan} paidUntil={until ? formatDate(until, business.country) : null} />
        {payments.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-500"><tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Status</th></tr></thead>
              <tbody>{payments.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{formatDate(p.paidAt ?? p.createdAt, business.country)}</td>
                  <td className="px-4 py-2">{isBundlePlan(p.plan) ? BUNDLE_PLANS[p.plan].name : p.plan}</td>
                  <td className="px-4 py-2">{(p.amountInPaise / 100).toLocaleString("en-CA", { style: "currency", currency: p.currency })}</td>
                  <td className="px-4 py-2">{p.status === "PAID" ? "Paid" : p.status === "FAILED" ? "Failed" : "Not completed"}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500">Automatic payment charges your card each month until you turn it off here. Turning it off stops future charges, and your plan runs to the end of what you&apos;ve paid for.</p>
      </div>
    );
  }

  const daysUntilExpiry = business.planExpiresAt
    ? Math.ceil((business.planExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const nearingExpiry = daysUntilExpiry !== null && daysUntilExpiry <= RENEWAL_REMINDER_WINDOW_DAYS;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-gray-500">
          {business.planExpiresAt
            ? `Your plan is paid until ${formatDate(business.planExpiresAt, business.country)}.`
            : "You're on the free Starter plan."}
        </p>
      </div>

      {nearingExpiry && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your {business.plan} plan {daysUntilExpiry! <= 0 ? "has ended" : `ends in ${daysUntilExpiry} day(s)`}. To renew, choose the same plan below. You won&apos;t be charged automatically; when it ends you move back to Starter.
        </div>
      )}

      <BillingCheckout currentPlan={business.plan} />
      <p className="text-xs text-gray-400">
        Plans last 30 days and renew manually, so there are no surprise charges.
      </p>
    </div>
  );
}
