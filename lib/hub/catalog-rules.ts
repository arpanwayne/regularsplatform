import { TOOLS, planTools, type Tool } from "@/lib/hub/plans";

/**
 * Products & Bundles: the rules, with no database access (unit-tested in
 * test/catalog.test.ts). lib/hub/catalog.ts does the reads and writes.
 */

export type Connect = "HUB" | "AUTO" | "MANUAL";
export const CONNECTS: Connect[] = ["HUB", "AUTO", "MANUAL"];

export type CatalogProduct = {
  key: string; name: string; description: string; url: string | null;
  connect: Connect; hubTool: Tool | null; sortOrder: number;
};

/**
 * Software that exists in code already. Created in the catalog the first
 * time the page opens; their name/price/description can be edited, but not
 * how they connect (that is code).
 */
export const BUILT_IN_PRODUCTS: CatalogProduct[] = [
  { key: "regulars", name: "Regulars", description: "Customers, inbox, WhatsApp/SMS follow-ups — the hub every bundle includes", url: null, connect: "HUB", hubTool: null, sortOrder: 0 },
  { key: "waynering", name: "WayneRing", description: "AI receptionist: answers calls, books, texts back missed calls", url: null, connect: "AUTO", hubTool: "WAYNERING", sortOrder: 10 },
  { key: "field-service", name: "Jobs (CRM)", description: "Quotes, jobs, technicians and invoices", url: null, connect: "AUTO", hubTool: "FIELD_SERVICE", sortOrder: 20 },
  { key: "gmb", name: "GMB Manager", description: "Google reviews and posts", url: null, connect: "AUTO", hubTool: "GMB", sortOrder: 30 },
  { key: "video", name: "AI Video Studio", description: "Video ads and social posts", url: null, connect: "AUTO", hubTool: "VIDEO", sortOrder: 40 },
  // Was a MANUAL starter product until Nov 2026; ensureCatalog() switches the existing row over.
  { key: "loyvexa", name: "Loyvexa", description: "Dealer and channel loyalty: points, schemes, rewards", url: null, connect: "AUTO", hubTool: "LOYVEXA", sortOrder: 70 },
];

/**
 * Our other products, added once as MANUAL (our team sets the client up and
 * the client opens them by link) until they get automatic set-up. Only
 * created if missing; after that they're ordinary catalog rows.
 */
export const STARTER_PRODUCTS: CatalogProduct[] = [
  { key: "korvo", name: "Korvo", description: "Distributor software: sales hierarchy, orders, Tally", url: null, connect: "MANUAL", hubTool: null, sortOrder: 60 },
];

export const isTool = (t: unknown): t is Tool => typeof t === "string" && (TOOLS as string[]).includes(t);

/** Connected tools in a set of products: AUTO ones only, in the standard order. */
export function toolsFromProducts(products: { connect: string; hubTool: string | null; active?: boolean }[]): Tool[] {
  const set = new Set(products.filter((p) => p.connect === "AUTO" && p.active !== false && isTool(p.hubTool)).map((p) => p.hubTool as Tool));
  return TOOLS.filter((t) => set.has(t));
}

export const encodeTools = (tools: Tool[]) => tools.join(",");
export const decodeTools = (s: string | null | undefined): Tool[] => {
  const set = new Set((s ?? "").split(",").filter(isTool));
  return TOOLS.filter((t) => set.has(t));
};

/** The connected tools a business gets: its custom bundle if it has one, else its built-in plan. */
export function businessTools(b: { customBundleId: string | null; bundleTools: string; frontDeskPlan: string | null }): Tool[] {
  return b.customBundleId ? decodeTools(b.bundleTools) : planTools(b.frontDeskPlan);
}

/** Days one payment covers. */
export const periodDays = (interval: string) => (interval === "YEARLY" ? 365 : 30);

/** A readable price line: "₹14,999 / month · C$499 / month". */
export function priceLine(p: { priceInr: number | null; priceCad: number | null; interval?: string }): string {
  const per = p.interval === "YEARLY" ? "year" : "month";
  const parts = [
    p.priceInr != null ? `₹${p.priceInr.toLocaleString("en-IN")} / ${per}` : null,
    p.priceCad != null ? `C$${p.priceCad} / ${per}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No price set";
}

/** Slug for a new product key: "Order Desk" → "order-desk". */
export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "product";
}

/** Sum of the products' own prices, to suggest a bundle price. */
export function suggestedPrice(products: { priceInr: number | null; priceCad: number | null }[]) {
  const sum = (k: "priceInr" | "priceCad") => (products.some((p) => p[k] != null) ? products.reduce((t, p) => t + (p[k] ?? 0), 0) : null);
  return { priceInr: sum("priceInr"), priceCad: sum("priceCad") };
}
