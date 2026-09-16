import { getCurrentBusiness } from "@/lib/session";
import { BillingCheckout } from "@/components/billing-checkout";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

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
      <BillingCheckout currentPlan={business.plan} />
      <p className="text-xs text-gray-400">
        Pricing draft hai — dekho PRICING.md repo mein. Plan 30 din ke liye valid rehta hai,
        payment ke baad manually renew karna hoga (auto-renewal abhi nahi hai).
      </p>
    </div>
  );
}
