import { getCurrentBusiness } from "@/lib/session";
import { BillingCheckout } from "@/components/billing-checkout";
import { RENEWAL_REMINDER_WINDOW_DAYS } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

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
