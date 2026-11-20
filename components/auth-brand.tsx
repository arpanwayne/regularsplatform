import { PORTAL_NAME, currentPortal } from "@/lib/portal";

/**
 * Logo above every sign-in page. Loopdesk AI shows its logo and name; Regulars shows
 * its own name. Same font and shapes either way; colours follow the portal.
 */
export function AuthBrand() {
  const portal = currentPortal();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
      <span className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-gray-900">
        {portal === "LOOPDESK" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/logo-small.png" alt="" width={60} height={40} className="h-10 w-auto" />
        )}
        {PORTAL_NAME[portal]}
      </span>
    </div>
  );
}
