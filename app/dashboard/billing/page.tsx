import { getCurrentBusiness } from "@/lib/session";
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
            {business.bundleStatus === "ACTIVE" && until && `${plan.name} is paid until ${until.toLocaleDateString("en-CA", { dateStyle: "medium" })}.`}
            {business.bundleStatus === "LAPSED" && "Your plan has ended and your tools are paused. Nothing has been deleted — pay to switch everything back on."}
          </p>
        </div>
        {business.bundleStatus === "ACTIVE" && days !== null && days <= RENEWAL_REMINDER_WINDOW_DAYS && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {days <= 0 ? `Your plan ended ${-days} day(s) ago. Tools stay on for ${GRACE_DAYS} days after the end date, then pause.` : `Your plan renews in ${days} day(s). Renewal is manual — pay below to add 30 days.`}
          </div>
        )}
        <BundleCheckout currentPlan={business.frontDeskPlan} status={business.bundleStatus} currency={currencyFor(business.country)} />
        {payments.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-500"><tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Status</th></tr></thead>
              <tbody>{payments.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{(p.paidAt ?? p.createdAt).toLocaleDateString("en-CA", { dateStyle: "medium" })}</td>
                  <td className="px-4 py-2">{isBundlePlan(p.plan) ? BUNDLE_PLANS[p.plan].name : p.plan}</td>
                  <td className="px-4 py-2">{(p.amountInPaise / 100).toLocaleString("en-CA", { style: "currency", currency: p.currency })}</td>
                  <td className="px-4 py-2">{p.status === "PAID" ? "Paid" : p.status === "FAILED" ? "Failed" : "Not completed"}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400">Plans run 30 days at a time and renew manually — there is no automatic charge.</p>
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
            ? `Current plan valid tak: ${new Date(business.planExpiresAt).toLocaleDateString("en-IN")}`
            : "Abhi free Starter plan pe ho."}
        </p>
      </div>

      {nearingExpiry && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Aapka {business.plan} plan {daysUntilExpiry! <= 0 ? "expire ho chuka hai" : `${daysUntilExpiry} din mein expire ho raha hai`}
          {" "}— renew karne ke liye neeche se dobara same plan select karo. Auto-charge nahi hota,
          expire hone pe plan automatically Starter pe wapas aa jaayega.
        </div>
      )}

      <BillingCheckout currentPlan={business.plan} />
      <p className="text-xs text-gray-400">
        Pricing draft hai — dekho PRICING.md repo mein. Plan 30 din ke liye valid rehta hai; koi
        saved payment method/autopay nahi hai, isliye renewal manual hai — expire hone pe plan
        khud-ba-khud Starter pe downgrade ho jaata hai (koi surprise charge nahi).
      </p>
    </div>
  );
}
