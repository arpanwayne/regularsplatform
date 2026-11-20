"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";

import type { Portal } from "@/lib/portal";

// Products & Bundles and Bundles are Loopdesk-only; the rest show in both
// portals, each listing only its own clients.
const LINKS: { href: string; label: string; loopdeskLabel?: string; only?: Portal }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/businesses", label: "Businesses", loopdeskLabel: "Clients" },
  { href: "/admin/catalog", label: "Products & Bundles", only: "LOOPDESK" },
  { href: "/admin/bundles", label: "Bundles", only: "LOOPDESK" },
  { href: "/admin/owners", label: "Owners" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/api-keys", label: "API keys" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/whatsapp-templates", label: "WhatsApp" },
  { href: "/admin/compliance", label: "Compliance" },
];

export function AdminNav({ adminName, portal, portalName, other }: {
  adminName: string;
  portal: Portal;
  portalName: string;
  /** The other portal's admin, for a super admin who runs both. */
  other?: { name: string; url: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login"); // full load clears the client page cache (bug B0)
  }

  return (
    <header className="border-b border-gray-200 bg-gray-900 text-white">
      <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-semibold">{portalName} · Admin</span>
          <nav className="flex gap-1">
            {LINKS.filter((l) => !l.only || l.only === portal).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  pathname === link.href ? "bg-white/15" : "text-gray-300 hover:bg-white/10"
                )}
              >
                {portal === "LOOPDESK" && link.loopdeskLabel ? link.loopdeskLabel : link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-300">
          {other && <a href={other.url} className="text-gray-300 hover:text-white">{other.name} admin ↗</a>}
          <span>{adminName}</span>
          <button onClick={logout} className="font-medium text-white hover:text-gray-200">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
