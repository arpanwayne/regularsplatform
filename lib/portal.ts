import { headers } from "next/headers";
import { BUNDLE_NAME } from "@/lib/brand";

/**
 * Two products run on this one app, server and database (Nov 2026):
 *
 *   LOOPDESK  the bundle hub: Products & Bundles, Bundles, clients who bought a
 *             bundle (Business.bundleStatus != NONE). Served on LOOPDESK_HOSTS,
 *             default app.loopdeskai.wayneesolutions.com.
 *   REGULARS  the loyalty product on its own: Starter / Growth / Pro plans
 *             (bundleStatus = NONE). Served on every other host, e.g.
 *             regulars.wayneesolutions.com.
 *
 * The portal is chosen by the address the page was opened on, so each one has
 * its own name, admin menu and client list. nginx must pass the real host
 * (proxy_set_header Host $host) for this to work.
 */
export type Portal = "LOOPDESK" | "REGULARS";

export const PORTAL_NAME: Record<Portal, string> = {
  LOOPDESK: BUNDLE_NAME,
  REGULARS: "Regulars",
};

function loopdeskHosts(): string[] {
  return (process.env.LOOPDESK_HOSTS || "app.loopdeskai.wayneesolutions.com")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Which portal a host name belongs to ("app.loopdeskai…:443" → LOOPDESK). */
export function portalForHost(host: string | null | undefined): Portal {
  const forced = process.env.PORTAL_OVERRIDE?.toUpperCase();
  if (forced === "LOOPDESK" || forced === "REGULARS") return forced; // local dev
  const h = (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return loopdeskHosts().includes(h) ? "LOOPDESK" : "REGULARS";
}

/** The portal for the page or API request being handled right now. */
export function currentPortal(): Portal {
  const h = headers();
  return portalForHost(h.get("x-forwarded-host") || h.get("host"));
}

/** A business belongs to Loopdesk once it has a bundle, otherwise to Regulars. */
export function portalOfBusiness(b: { bundleStatus: string }): Portal {
  return b.bundleStatus !== "NONE" ? "LOOPDESK" : "REGULARS";
}

/** Prisma filter: only the businesses of one portal. */
export function businessWhere(portal: Portal) {
  return portal === "LOOPDESK" ? { bundleStatus: { not: "NONE" } } : { bundleStatus: "NONE" };
}

/** Public base URL of a portal, or null when it isn't configured. */
export function portalUrl(portal: Portal): string | null {
  const raw = portal === "LOOPDESK" ? process.env.LOOPDESK_APP_URL : process.env.REGULARS_APP_URL || process.env.APP_URL;
  return raw ? raw.replace(/\/$/, "") : null;
}
