import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import { ingestGrowthEvents } from "@/lib/growth/events";

const body = z.object({ events: z.array(z.unknown()).min(1).max(100) });

/**
 * POST /api/v1/growth/events — the AI Growth Manager's timeline.
 * Same API keys as /api/v1/events (Authorization: Bearer rk_live_…).
 *
 * { "events": [ { "type": "QUOTE_SENT", "externalId": "fsm:quote:64f…", "phone": "+16475550111",
 *                 "name": "Priya Shah", "value": 3100, "ref": "quote:64f…",
 *                 "occurredAt": "2026-11-05T15:00:00-05:00", "data": { "description": "AC install" } } ] }
 *
 * Types: CALL_ANSWERED CALL_MISSED CALL_SHORT CALLBACK_ANSWERED CALLBACK_UNANSWERED BOOKING
 *        QUOTE_SENT QUOTE_ACCEPTED QUOTE_DECLINED JOB_DONE INVOICE_PAID VISIT REVIEW_RECEIVED MESSAGE_IN
 * Idempotent on externalId. Conversions are credited to the AI action that preceded them.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  if (auth.suspended) return NextResponse.json({ error: "Business is suspended" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { events: [...] } with 1–100 events" }, { status: 400 });
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.business.id }, include: { locations: true } });
  return NextResponse.json(await ingestGrowthEvents(business, parsed.data.events, `api:${auth.apiKey.keyPrefix}`));
}
