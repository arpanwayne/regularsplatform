"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { BUNDLE_NAME } from "@/lib/brand";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/growth", label: "Growth AI" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/inbox", label: "Inbox" },
  { href: "/dashboard/calling-scripts", label: "Calling scripts" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav({
  businessName,
  isSuperAdmin,
  bundle,
}: {
  businessName: string;
  isSuperAdmin?: boolean;
  /** Bundle A: one menu for every tool; tools in other apps open with single sign-on. */
  bundle?: { calls: boolean; jobs: boolean };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="order-last flex w-full items-center gap-8 lg:order-none lg:w-auto">
          <span className="hidden font-semibold lg:inline">{bundle ? BUNDLE_NAME : "Regulars"}</span>
          <nav className="-mx-1 flex gap-1 overflow-x-auto whitespace-nowrap lg:mx-0 lg:flex-wrap">
            {(bundle ? LINKS.filter((l) => l.href !== "/dashboard/calling-scripts").map((l) => (l.href === "/dashboard" ? { ...l, label: "Home" } : l)) : LINKS).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition",
                  pathname === link.href
                    ? "bg-brand-100 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                {link.label}
              </Link>
            ))}
            {bundle?.calls && <a href="/api/hub/open/wayneRing?page=calls" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">Calls ↗</a>}
            {bundle?.jobs && <a href="/api/hub/open/field-service" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">Jobs ↗</a>}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {isSuperAdmin && (
            <Link href="/admin" className="font-medium text-brand-700 hover:text-brand-800">
              Admin panel
            </Link>
          )}
          <span className="truncate font-medium text-gray-800 lg:font-normal lg:text-gray-500">{businessName}</span>
          <button onClick={logout} className="font-medium text-gray-700 hover:text-gray-900">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
