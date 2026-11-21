"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";

const LINKS: { href: string; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/businesses", label: "Businesses" },
  { href: "/admin/owners", label: "Owners" },
  { href: "/admin/usage", label: "Usage" },
  { href: "/admin/api-keys", label: "API keys" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/whatsapp-templates", label: "WhatsApp" },
  { href: "/admin/compliance", label: "Compliance" },
];

export function AdminNav({ adminName }: { adminName: string }) {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login"); // full load clears the client page cache (bug B0)
  }

  return (
    <AppHeader
      wordmark="Regulars"
      toolName="Admin"
      homeHref="/admin"
      links={LINKS}
      activeHref={pathname}
      right={
        <>
          <span className="hidden font-medium text-white sm:inline">{adminName}</span>
          <button onClick={logout} className="font-medium text-brand-200 hover:text-white">
            Log out
          </button>
        </>
      }
    />
  );
}
