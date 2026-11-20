"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BUNDLE_NAME } from "@/lib/brand";
import { AppHeader, type HeaderLink, type SwitcherItem } from "@/components/app-header";

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
  bundle,
}: {
  businessName: string;
  isSuperAdmin?: boolean;
  /** Managers see only the pages they work in (no billing, settings, team, Growth AI). */
  isManager?: boolean;
  /** Bundle A: one menu for every tool; tools in other apps open with single sign-on. */
  bundle?: { calls: boolean; jobs: boolean; switcher: SwitcherItem[] };
}) {
  const pathname = usePathname();
  const links = isManager ? LINKS.filter((l) => !l.ownerOnly) : LINKS;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Full page load: drops Next's client cache so the next account never sees this one's pages (bug B0).
    window.location.assign("/login");
  }

  const navLinks: HeaderLink[] = bundle
    ? links
        .filter((l) => l.href !== "/dashboard/calling-scripts")
        .map((l) => (l.href === "/dashboard" ? { ...l, label: "Home" } : l.href === "/dashboard/growth" ? { ...l, label: "Growth Manager" } : l))
    : links;
  if (bundle && !isManager) {
    if (bundle.calls) navLinks.push({ href: "/api/hub/open/wayneRing?page=calls", label: "Calls ↗", external: true });
    if (bundle.jobs) navLinks.push({ href: "/api/hub/open/field-service", label: "Jobs ↗", external: true });
  }

  return (
    <AppHeader
      wordmark={bundle ? BUNDLE_NAME : "Regulars"}
      homeHref="/dashboard"
      links={navLinks}
      activeHref={pathname}
      switcher={bundle && !isManager ? bundle.switcher : undefined}
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
