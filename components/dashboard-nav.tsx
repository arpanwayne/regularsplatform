"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/calling-scripts", label: "Calling scripts" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function DashboardNav({
  businessName,
  isSuperAdmin,
}: {
  businessName: string;
  isSuperAdmin?: boolean;
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
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-semibold">Regulars</span>
          <nav className="flex gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  pathname === link.href
                    ? "bg-brand-100 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {isSuperAdmin && (
            <Link href="/admin" className="font-medium text-brand-700 hover:text-brand-800">
              Admin panel
            </Link>
          )}
          <span>{businessName}</span>
          <button onClick={logout} className="font-medium text-gray-700 hover:text-gray-900">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
