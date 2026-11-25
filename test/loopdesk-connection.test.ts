import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { SignJWT } from "jose";
import {
  HUB_AUDIENCE, HUB_ISSUER, bearer, hubAnswerStatus, hubSecret, hubStatusChange, matchOwner, safeNext, toSector, verifyHubJwt,
} from "../lib/hub-rules";

const SECRET = "x".repeat(40);
const key = new TextEncoder().encode(SECRET);

// Signed exactly like Loopdesk's lib/hub/tokens.ts signHubToken().
function sign(purpose: string, opts: { iss?: string; aud?: string; sub?: string; ttl?: number; secret?: Uint8Array; claims?: Record<string, unknown> } = {}) {
  return new SignJWT({ ...(opts.claims ?? {}), purpose })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(opts.iss ?? HUB_ISSUER)
    .setAudience(opts.aud ?? HUB_AUDIENCE)
    .setSubject(opts.sub ?? "hub-biz-1")
    .setJti(randomBytes(12).toString("hex"))
    .setIssuedAt()
    .setExpirationTime(`${opts.ttl ?? 60}s`)
    .sign(opts.secret ?? key);
}

test("HUB_SECRET must be set and 32+ characters", () => {
  assert.equal(hubSecret({}), null);
  assert.equal(hubSecret({ HUB_SECRET: "short" }), null);
  assert.ok(hubSecret({ HUB_SECRET: SECRET }));
});

test("a Loopdesk token for Regulars is accepted for its own purpose", async () => {
  const claims = await verifyHubJwt(await sign("provision"), key, "provision");
  assert.equal(claims.sub, "hub-biz-1");
  assert.equal(claims.purpose, "provision");
  assert.ok(claims.jti);
  const sso = await verifyHubJwt(await sign("sso", { claims: { acct: "b1", next: "/dashboard/offers" } }), key, "sso");
  assert.equal(sso.acct, "b1");
});

test("wrong purpose, audience, issuer, secret or an expired token is refused", async () => {
  await assert.rejects(verifyHubJwt(await sign("sso"), key, "provision"));
  await assert.rejects(verifyHubJwt(await sign("provision", { aud: "korvo" }), key, "provision"));
  await assert.rejects(verifyHubJwt(await sign("provision", { iss: "someone-else" }), key, "provision"));
  await assert.rejects(verifyHubJwt(await sign("provision", { secret: new TextEncoder().encode("y".repeat(40)) }), key, "provision"));
  await assert.rejects(verifyHubJwt(await sign("provision", { ttl: -10 }), key, "provision"));
  await assert.rejects(verifyHubJwt("not-a-jwt", key, "provision"));
});

test("bearer header parsing", () => {
  assert.equal(bearer("Bearer abc.def"), "abc.def");
  assert.equal(bearer("bearer   abc"), "abc");
  assert.equal(bearer("Basic abc"), null);
  assert.equal(bearer(null), null);
});

test("Loopdesk pauses and resumes, but never lifts an admin's suspension", () => {
  assert.deepEqual(hubStatusChange({ status: "ACTIVE", hubSuspended: false }, false), { status: "SUSPENDED", hubSuspended: true });
  assert.deepEqual(hubStatusChange({ status: "SUSPENDED", hubSuspended: true }, true), { status: "ACTIVE", hubSuspended: false });
  // Admin suspended it: Loopdesk turning it on changes nothing.
  assert.equal(hubStatusChange({ status: "SUSPENDED", hubSuspended: false }, true), null);
  // Already off: pausing again changes nothing (and doesn't claim the admin's suspension).
  assert.equal(hubStatusChange({ status: "SUSPENDED", hubSuspended: false }, false), null);
  assert.equal(hubStatusChange({ status: "ACTIVE", hubSuspended: false }, true), null);
  assert.equal(hubAnswerStatus("SUSPENDED"), "PAUSED");
  assert.equal(hubAnswerStatus("ACTIVE"), "ACTIVE");
});

test("owner email decides: create, link an existing Regulars business, or refuse", () => {
  assert.deepEqual(matchOwner(null, null), { kind: "create-owner" });
  assert.deepEqual(matchOwner({ id: "u1", role: "OWNER" }, null), { kind: "create-business", userId: "u1" });
  assert.deepEqual(matchOwner({ id: "u1", role: "OWNER" }, { id: "b1", hubBusinessId: null }), { kind: "link-business", businessId: "b1" });
  assert.equal(matchOwner({ id: "u1", role: "OWNER" }, { id: "b1", hubBusinessId: "other" }).kind, "refuse");
  assert.equal(matchOwner({ id: "u2", role: "MANAGER" }, null).kind, "refuse");
  assert.equal(matchOwner({ id: "u3", role: "SUPER_ADMIN" }, null).kind, "refuse");
});

test("after one login we only go to a page in this app", () => {
  assert.equal(safeNext("/dashboard/offers"), "/dashboard/offers");
  assert.equal(safeNext("https://evil.example"), "/dashboard");
  assert.equal(safeNext("//evil.example"), "/dashboard");
  assert.equal(safeNext("/\\evil.example"), "/dashboard");
  assert.equal(safeNext(undefined), "/dashboard");
});

test("Loopdesk sectors map onto Regulars sectors", () => {
  assert.equal(toSector("salon"), "SALON");
  assert.equal(toSector("RESTAURANT"), "RESTAURANT");
  assert.equal(toSector("spaceship"), "OTHER");
  assert.equal(toSector(null), "OTHER");
});
