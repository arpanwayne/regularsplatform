import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/admin";
import { AdminNav } from "@/components/admin-nav";
import { PORTAL_NAME, currentPortal, portalUrl } from "@/lib/portal";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    redirect("/dashboard");
  }

  const portal = currentPortal();
  const other = portal === "LOOPDESK" ? "REGULARS" : "LOOPDESK";
  const otherUrl = portalUrl(other);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNav adminName={admin.name} portal={portal} portalName={PORTAL_NAME[portal]}
        other={otherUrl ? { name: PORTAL_NAME[other], url: `${otherUrl}/admin` } : undefined} />
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
