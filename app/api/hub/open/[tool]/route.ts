import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness, getCurrentUser } from "@/lib/session";
import { TOOL_META, bundleLive, planTools, type Tool } from "@/lib/hub/plans";
import { signHubToken, toolUrl } from "@/lib/hub/tokens";

const SLUG: Record<string, Tool> = { wayneRing: "WAYNERING", "field-service": "FIELD_SERVICE", gmb: "GMB", video: "VIDEO" };

/**
 * One login: GET /api/hub/open/wayneRing?page=calls
 *
 * The owner is already signed in here. We hand their browser a one-time,
 * 60-second token for that tool; the tool's /sso page swaps it for its own
 * session (POST …/hub/sso/exchange) and lands them on the page they asked
 * for. No second password, and the token can't be reused.
 */
export async function GET(req: NextRequest, { params }: { params: { tool: string } }) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/dashboard?hub=${encodeURIComponent(msg)}`, req.url));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const business = await getCurrentBusiness();
  const tool = SLUG[params.tool];
  if (!business || !tool) return back("unknown");

  if (!planTools(business.frontDeskPlan).includes(tool)) return back("not-in-plan");
  if (!bundleLive(business) || business.status === "SUSPENDED") return back("plan-inactive");
  const account = await prisma.toolAccount.findUnique({ where: { businessId_tool: { businessId: business.id, tool } } });
  if (!account?.externalId || account.status !== "ACTIVE") return back("setting-up");
  const app = toolUrl(tool, "app");
  if (!app) return back("setting-up");

  const pages = TOOL_META[tool].pages ?? {};
  const page = req.nextUrl.searchParams.get("page") ?? "home";
  const next = pages[page] ?? pages.home ?? "/";

  const token = await signHubToken(tool, "sso", business.id, { acct: account.externalId, email: user.email, name: user.name, next }, 60);
  const url = new URL("/sso", app);
  // Fragment, not query: it never reaches server logs or Referer headers.
  url.hash = new URLSearchParams({ token, next }).toString();
  const res = NextResponse.redirect(url);
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
