import { redirect } from "next/navigation";
import { getCurrentBusiness, getCurrentUser } from "@/lib/session";
import { DashboardNav } from "@/components/dashboard-nav";
import { businessTools } from "@/lib/hub/catalog-rules";
import { switcherItems } from "@/lib/hub/switcher";
import { currentPortal, portalForHost, portalOfBusiness, portalUrl } from "@/lib/portal";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    // Not /login: a stale cookie would bounce back here from the middleware.
    redirect("/api/auth/clear-session");
  }

  const business = await getCurrentBusiness();
  if (!business) {
    // A super admin has no Business of their own — send them to their
    // actual home page instead of erroring on a missing business.
    redirect(user.role === "SUPER_ADMIN" ? "/admin" : "/api/auth/clear-session");
  }

  // A bundle client opened on the Regulars address (or a Regulars-plan client on
  // Loopdesk's): send them to their own portal to log in there.
  if (user.role !== "SUPER_ADMIN") {
    const home = portalOfBusiness(business);
    const url = portalUrl(home);
    if (home !== currentPortal() && url && portalForHost(new URL(url).host) === home) redirect(`${url}/login?moved=1`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav
        businessName={business.name}
        isSuperAdmin={user.role === "SUPER_ADMIN"}
        isManager={business.ownerId !== user.id}
        bundle={business.bundleStatus === "NONE" ? undefined : {
          calls: businessTools(business).includes("WAYNERING"),
          jobs: businessTools(business).includes("FIELD_SERVICE"),
          switcher: switcherItems(businessTools(business)),
        }}
      />
      <div className="mx-auto max-w-6xl px-6 py-8">
        {business.status === "SUSPENDED" && (
          <div className="mb-6 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            This account has been suspended, so messages and follow-ups are off. Please contact support.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
