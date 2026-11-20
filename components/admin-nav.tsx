"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login"); // full load clears the client page cache (bug B0)
  }

  return (
    <AppHeader
      wordmark={portalName}
      toolName="Admin"
      homeHref="/admin"
      links={LINKS.filter((l) => !l.only || l.only === portal).map((l) => ({
        href: l.href,
        label: portal === "LOOPDESK" && l.loopdeskLabel ? l.loopdeskLabel : l.label,
      }))}
      activeHref={pathname}
      right={
        <>
          {other && <a href={other.url} className="font-medium text-brand-200 hover:text-white">{other.name} admin ↗</a>}
          <span className="hidden font-medium text-white sm:inline">{adminName}</span>
          <button onClick={logout} className="font-medium text-brand-200 hover:text-white">
            Log out
          </button>
        </>
      }
    />
  );
}
