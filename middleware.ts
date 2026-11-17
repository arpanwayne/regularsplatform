import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (!session && (pathname.startsWith("/dashboard") || pathname.startsWith("/admin"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // A signed-in team member may open a bundle signup link (/signup?plan=GROW)
  // to test or onboard a client; the page warns that it replaces the session.
  const bundleSignup = pathname === "/signup" && req.nextUrl.searchParams.has("plan");
  if (session && isAuthPage && !bundleSignup) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/signup"],
};
