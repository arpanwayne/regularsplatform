import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import { HubAuthError, consumeHubToken } from "@/lib/hub";
import { HUB_PLAN, bearer, hubAnswerStatus, hubStatusChange, matchOwner, toSector } from "@/lib/hub-rules";

/**
 * Loopdesk AI sets up (or updates, or pauses) a client's Regulars account.
 *
 *   POST /api/hub/provision
 *   Authorization: Bearer <Loopdesk JWT, purpose "provision">
 *   { hubBusinessId, active, business{name, sector, country}, owner{name, email, phone} , … }
 *   → 200 { accountId, status: "ACTIVE" | "PAUSED", data{ locationId, ownerEmail, linkedExisting } }
 *
 * Idempotent: the same hubBusinessId always gets the same business back.
 * Loopdesk sends more fields (paidUntil, plan, tools…); the ones not used here are ignored.
 */
const bodySchema = z.object({
  hubBusinessId: z.string().min(1),
  active: z.boolean(),
  business: z.object({
    name: z.string().min(1),
    sector: z.string().nullish(),
    country: z.string().nullish(),
  }),
  owner: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().nullish(),
  }),
  /** Loopdesk's QR join code for this business: our QR uses the same one (one WhatsApp number per bundle). */
  joinCode: z.string().regex(/^[A-Z0-9]{4,12}$/i).nullish(),
});

export async function POST(req: NextRequest) {
  let claims;
  try {
    claims = await consumeHubToken(bearer(req.headers.get("authorization")), "provision");
  } catch (err) {
    const e = err instanceof HubAuthError ? err : new HubAuthError("Invalid token");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", detail: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  if (body.hubBusinessId !== claims.sub) return NextResponse.json({ error: "Token is for a different business" }, { status: 403 });

  const email = body.owner.email.toLowerCase();
  const sector = toSector(body.business.sector);
  const country = (body.business.country ?? "IN").toUpperCase().slice(0, 2) || "IN";

  let biz = await prisma.business.findUnique({ where: { hubBusinessId: body.hubBusinessId }, include: { locations: { orderBy: { createdAt: "asc" }, take: 1 } } });
  let linkedExisting = false;

  if (!biz) {
    const user = await prisma.user.findUnique({ where: { email } });
    const first = user ? await prisma.business.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, hubBusinessId: true, status: true, hubSuspended: true } }) : null;
    const match = matchOwner(user, first);
    const off = body.active ? {} : { status: "SUSPENDED", hubSuspended: true };
    const newBusiness = { name: body.business.name, sector, country, hubBusinessId: body.hubBusinessId, ...HUB_PLAN, ...off, locations: { create: { name: body.business.name } } };

    if (match.kind === "refuse") {
      await logEvent({ source: "BILLING", level: "ERROR", message: "Loopdesk set-up refused", meta: { hubBusinessId: body.hubBusinessId, email, reason: match.reason } });
      return NextResponse.json({ error: match.reason }, { status: 409 });
    }
    if (match.kind === "link-business") {
      linkedExisting = true;
      // Pause / resume with the same rule as later calls, so an admin's suspension is never lifted.
      const change = first ? hubStatusChange(first, body.active) : null;
      await prisma.business.update({ where: { id: match.businessId }, data: { hubBusinessId: body.hubBusinessId, ...HUB_PLAN, ...(change ?? {}) } });
    } else if (match.kind === "create-business") {
      await prisma.business.create({ data: { ...newBusiness, ownerId: match.userId } });
    } else {
      // The owner signs in through Loopdesk; this random password is never shown.
      // They can set their own later with "Forgot password".
      const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
      await prisma.user.create({
        data: { name: body.owner.name, email, passwordHash, phone: body.owner.phone ?? null, role: "OWNER", businesses: { create: newBusiness } },
      });
    }
    biz = await prisma.business.findUnique({ where: { hubBusinessId: body.hubBusinessId }, include: { locations: { orderBy: { createdAt: "asc" }, take: 1 } } });
    if (!biz) return NextResponse.json({ error: "Set-up failed" }, { status: 500 });
    if (biz.locations.length === 0) {
      // A linked business from before locations were required.
      await prisma.location.create({ data: { businessId: biz.id, name: biz.name } });
      biz = await prisma.business.findUnique({ where: { id: biz.id }, include: { locations: { orderBy: { createdAt: "asc" }, take: 1 } } });
    }
    await logEvent({ businessId: biz!.id, source: "BILLING", level: "INFO", message: linkedExisting ? "Linked to Loopdesk AI" : "Set up by Loopdesk AI", meta: { hubBusinessId: body.hubBusinessId } });
  } else {
    // Already ours: keep the name and sector in step with Loopdesk, apply pause / resume.
    const change = hubStatusChange(biz, body.active);
    biz = await prisma.business.update({
      where: { id: biz.id },
      data: { name: body.business.name, sector, ...HUB_PLAN, ...(change ?? {}) },
      include: { locations: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (change) await logEvent({ businessId: biz.id, source: "BILLING", level: "INFO", message: body.active ? "Resumed by Loopdesk AI" : "Paused by Loopdesk AI" });
  }

  // One number for the whole bundle (Regulars retest, 27 Nov 2026): a Regulars QR
  // must carry Loopdesk's join code, so the scan reaches Loopdesk's webhook,
  // which knows the business and passes the message on to us.
  const first = biz!.locations[0];
  const joinCode = body.joinCode?.toUpperCase();
  if (first && joinCode && first.joinCode !== joinCode) {
    const taken = await prisma.location.findFirst({ where: { joinCode, NOT: { id: first.id } }, select: { id: true } });
    if (taken) await logEvent({ businessId: biz!.id, source: "BILLING", level: "WARN", message: "Loopdesk QR join code already used by another location here; kept our own", meta: { joinCode } });
    else await prisma.location.update({ where: { id: first.id }, data: { joinCode } });
  }

  return NextResponse.json({
    accountId: biz!.id,
    status: hubAnswerStatus(biz!.status),
    data: { locationId: biz!.locations[0]?.id ?? null, ownerEmail: email, linkedExisting },
  });
}
