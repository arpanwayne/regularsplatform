import { getOwnerBusinessOrRedirect } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { BillingCheckout } from "@/components/billing-checkout";
import { RENEWAL_REMINDER_WINDOW_DAYS } from "@/lib/billing";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const business = await getOwnerBusinessOrRedirect();
  if (!business) return null;

  const daysUntilExpiry = business.planExpiresAt
    ? Math.ceil((business.planExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const nearingExpiry = daysUntilExpiry !== null && daysUntilExpiry <= RENEWAL_REMINDER_WINDOW_DAYS;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-gray-500">
          {business.planExpiresAt
            ? `Your plan is paid until ${formatDate(business.planExpiresAt, business.country)}.`
            : "You're on the Starter plan."}
        </p>
      </div>

      {nearingExpiry && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your {business.plan} plan {daysUntilExpiry! <= 0 ? "has ended" : `ends in ${daysUntilExpiry} day(s)`}. To renew, choose the same plan below. You won&apos;t be charged automatically; when it ends you move back to Starter.
        </div>
      )}

      <BillingCheckout currentPlan={business.plan} />
      <p className="text-xs text-gray-500">
        Plans last 30 days and renew manually, so there are no surprise charges.
      </p>
    </div>
  );
}
