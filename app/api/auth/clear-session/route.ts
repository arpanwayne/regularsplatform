import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * GET /api/auth/clear-session — drops a session cookie the server can no
 * longer use and sends the person to the login page.
 *
 * Why: the middleware only checks the cookie's signature, while the pages
 * also look the user up. A cookie that is signed but stale (password reset,
 * deleted account, owner with no business) made /dashboard send people to
 * /login and the middleware send them straight back: ERR_TOO_MANY_REDIRECTS.
 * Pages now come here instead of /login, so the loop can't start.
 */
export function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "?expired=1";
  const res = NextResponse.redirect(url);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
