"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/growth", label: "Growth AI", ownerOnly: true },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/offers", label: "Offers" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/qr", label: "QR codes" },
  { href: "/dashboard/calling-scripts", label: "Calling scripts", ownerOnly: true },
  { href: "/dashboard/team", label: "Team", ownerOnly: true },
  { href: "/dashboard/billing", label: "Billing", ownerOnly: true },
  { href: "/dashboard/settings", label: "Settings", ownerOnly: true },
];

export function DashboardNav({
  businessName,
  isSuperAdmin,
  isManager = false,
}: {
  businessName: string;
  isSuperAdmin?: boolean;
  /** Managers see only the pages they work in (no billing, settings, team, Growth AI). */
  isManager?: boolean;
}) {
  const pathname = usePathname();
  const links = isManager ? LINKS.filter((l) => !l.ownerOnly) : LINKS;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Full page load: drops Next's client cache so the next account never sees this one's pages (bug B0).
    window.location.assign("/login");
  }

  return (
    <AppHeader
      wordmark="Regulars"
      homeHref="/dashboard"
      links={links}
      activeHref={pathname}
      right={
        <>
          {isSuperAdmin && (
            <Link href="/admin" className="font-medium text-white hover:underline">
              Admin panel
            </Link>
          )}
          <span className="hidden truncate font-medium text-white sm:inline">{businessName}</span>
          <button onClick={logout} className="font-medium text-brand-200 hover:text-white">
            Log out
          </button>
        </>
      }
    />
  );
}
