import { redirect } from "next/navigation";
import { getCurrentBusiness, getCurrentUser } from "@/lib/session";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const business = await getCurrentBusiness();
  if (!business) {
    // A super admin has no Business of their own — send them to their
    // actual home page instead of erroring on a missing business.
    redirect(user.role === "SUPER_ADMIN" ? "/admin" : "/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav businessName={business.name} isSuperAdmin={user.role === "SUPER_ADMIN"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        {business.status === "SUSPENDED" && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Yeh business account platform admin ne suspend kar diya hai — WhatsApp data capture
            aur calling scripts abhi disabled hain. Apne admin se contact karo.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
