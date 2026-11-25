import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";
import { HubAuthError, useHubToken } from "@/lib/hub";
import { safeNext } from "@/lib/hub-rules";

/**
 * One login from Loopdesk AI. The /sso page posts the one-time token Loopdesk
 * put in the address; we check it and sign the business owner in here.
 *
 *   POST /api/hub/sso/exchange  { token }  →  { next }  + session cookie
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  let claims;
  try {
    claims = await useHubToken(typeof body?.token === "string" ? body.token : null, "sso");
  } catch (err) {
    const e = err instanceof HubAuthError ? err : new HubAuthError("Invalid token");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }

  const business = await prisma.business.findUnique({ where: { hubBusinessId: claims.sub }, include: { owner: true } });
  if (!business || (typeof claims.acct === "string" && claims.acct !== business.id)) {
    return NextResponse.json({ error: "This Regulars account isn't set up yet. Try again in a few minutes." }, { status: 404 });
  }
  if (business.status === "SUSPENDED") {
    return NextResponse.json({ error: "Regulars is paused for this business." }, { status: 403 });
  }

  const owner = business.owner;
  const token = await createSessionToken({ userId: owner.id, email: owner.email });
  const res = NextResponse.json({ next: safeNext(claims.next) });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  res.headers.set("cache-control", "no-store");
  return res;
}
