// A stale session cookie must never cause ERR_TOO_MANY_REDIRECTS (17 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { GET } from "../app/api/auth/clear-session/route";
import { SESSION_COOKIE } from "../lib/auth";

test("clear-session drops the cookie and goes to /login", () => {
  const res = GET(new NextRequest("https://regulars.example.com/api/auth/clear-session", { headers: { cookie: `${SESSION_COOKIE}=stale` } }));
  assert.equal(res.status, 307);
  assert.equal(new URL(res.headers.get("location")!).pathname, "/login");
  const setCookie = res.headers.get("set-cookie") ?? "";
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE}=;`));
  assert.match(setCookie, /Max-Age=0/i);
});

test("the dashboard never sends a signed-in cookie straight to /login", () => {
  const layout = readFileSync("app/dashboard/layout.tsx", "utf8");
  assert.doesNotMatch(layout, /redirect\(\s*"\/login"\s*\)/);
  assert.doesNotMatch(layout, /:\s*"\/login"\s*\)/);
  // ...and the middleware doesn't intercept the clear-session route.
  const mw = readFileSync("middleware.ts", "utf8");
  assert.doesNotMatch(mw, /"\/api\//);
});
