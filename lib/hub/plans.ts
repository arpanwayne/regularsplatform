import type { FrontDeskPlan } from "@/lib/types";
import { FRONT_DESK_SMS_LIMIT } from "@/lib/types";
import { TOOL_NAMES } from "@/lib/brand";

/**
 * Bundle A as one product: one signup, one bill, one login.
 *
 * Regulars is the hub. Each plan switches on a set of tools; the hub creates
 * the business's account in each of them (lib/hub/provision.ts) and signs the
 * owner in with one click (app/api/hub/open/[tool]).
 *
 * Prices: CAD are the published Front Desk prices. INR are a DRAFT — confirm
 * before taking Indian payments.
 */
export type Tool = "WAYNERING" | "FIELD_SERVICE" | "GMB" | "VIDEO";
export const TOOLS: Tool[] = ["WAYNERING", "FIELD_SERVICE", "GMB", "VIDEO"];
export type Currency = "CAD" | "INR";

export type BundlePlan = {
  id: FrontDeskPlan;
  name: string;
  tagline: string;
  price: Record<Currency, number>;
  tools: Tool[];
  growthManager: boolean;
  features: string[];
};

export const BUNDLE_PLANS: Record<FrontDeskPlan, BundlePlan> = {
  ANSWER: {
    id: "ANSWER", name: "Answer", tagline: "Never miss a call",
    price: { CAD: 149, INR: 4999 }, tools: ["WAYNERING"], growthManager: false,
    features: ["AI receptionist answers every call, 24/7", "Text summary to you after every call", "Shared customer inbox"],
  },
  ANSWER_RETURN: {
    id: "ANSWER_RETURN", name: "Answer + Return", tagline: "Turn calls into repeat customers",
    price: { CAD: 249, INR: 7999 }, tools: ["WAYNERING"], growthManager: true,
    features: ["Everything in Answer", "Missed-call text-back, review requests, win-backs", `${TOOL_NAMES.growth} with a morning plan`],
  },
  GROW: {
    id: "GROW", name: "Grow", tagline: "The whole growth team",
    price: { CAD: 549, INR: 17999 }, tools: ["WAYNERING", "FIELD_SERVICE", "GMB", "VIDEO"], growthManager: true,
    features: ["Everything in Answer + Return", `${TOOL_NAMES.jobs}: quotes, jobs, invoices`, `${TOOL_NAMES.google}: review replies and posts`, `Promo reels from ${TOOL_NAMES.ads}`],
  },
};

export const BUNDLE_PLAN_IDS = Object.keys(BUNDLE_PLANS) as FrontDeskPlan[];
export const GRACE_DAYS = 3;
export const PERIOD_DAYS = 30;

export const TOOL_META: Record<Tool, {
  name: string;
  /** What the owner gets there, for the home screen. */
  blurb: string;
  /** Owner can sign in to it with one click from the home screen. */
  ownerLogin: boolean;
  apiEnv: string;
  appEnv?: string;
  secretEnv: string;
  /** Pages the owner may be sent to after single sign-on. */
  pages?: Record<string, string>;
}> = {
  WAYNERING: {
    name: TOOL_NAMES.calls, blurb: "Calls, recordings and your AI receptionist", ownerLogin: true,
    apiEnv: "WAYNERING_API_URL", appEnv: "WAYNERING_APP_URL", secretEnv: "HUB_SECRET_WAYNERING",
    pages: { home: "/portal", calls: "/portal/inbound/calls", receptionist: "/portal/inbound/receptionist", numbers: "/portal/inbound/numbers" },
  },
  FIELD_SERVICE: {
    name: TOOL_NAMES.jobs, blurb: "Quotes, jobs, technicians and invoices", ownerLogin: true,
    apiEnv: "FIELD_SERVICE_API_URL", appEnv: "FIELD_SERVICE_APP_URL", secretEnv: "HUB_SECRET_FIELD_SERVICE",
    pages: { home: "/admin/dashboard" },
  },
  GMB: {
    name: TOOL_NAMES.google, blurb: "Reviews and posts on your Google listing", ownerLogin: true,
    apiEnv: "GMB_API_URL", appEnv: "GMB_APP_URL", secretEnv: "HUB_SECRET_GMB",
    pages: { home: "/", reviews: "/reviews" },
  },
  VIDEO: {
    name: TOOL_NAMES.ads, blurb: "Finished video ads and social posts", ownerLogin: true,
    apiEnv: "VIDEO_STUDIO_API_URL", appEnv: "VIDEO_STUDIO_APP_URL", secretEnv: "HUB_SECRET_VIDEO",
    pages: { home: "/ads", make: "/ads/new" },
  },
};

export const currencyFor = (country: string): Currency => (country === "IN" ? "INR" : "CAD");
export const isBundlePlan = (p: string | null | undefined): p is FrontDeskPlan => !!p && p in BUNDLE_PLANS;
export const planTools = (p: string | null | undefined): Tool[] => (isBundlePlan(p) ? BUNDLE_PLANS[p].tools : []);
export const smsLimitFor = (p: FrontDeskPlan) => FRONT_DESK_SMS_LIMIT[p];

export function formatPrice(amount: number, currency: Currency) {
  return currency === "INR" ? `₹${amount.toLocaleString("en-IN")}` : `C$${amount}`;
}

/** Tools are reachable while paid, plus a short grace after the paid period ends. */
export function bundleLive(b: { bundleStatus: string; bundlePaidUntil: Date | null }, now = new Date()) {
  if (b.bundleStatus !== "ACTIVE" || !b.bundlePaidUntil) return false;
  return b.bundlePaidUntil.getTime() + GRACE_DAYS * 86400000 > now.getTime();
}
