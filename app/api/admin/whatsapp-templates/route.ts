import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { logEvent } from "@/lib/logger";
import { listMetaTemplates, mergeStatus, submitAllTemplates } from "@/lib/whatsapp-template-sync";

/**
 * GET  /api/admin/whatsapp-templates?locationId=&wabaId=  — our templates + Meta status
 * POST /api/admin/whatsapp-templates { locationId?, wabaId? } — submit the missing ones
 *
 * Default account = the shared Loopdesk number (WHATSAPP_SHARED_WABA_ID +
 * WHATSAPP_SHARED_ACCESS_TOKEN). For a client with its own number, pass its
 * locationId (its saved access token is used) and its WABA ID.
 */
async function account(locationId?: string | null, wabaId?: string | null) {
  if (locationId) {
    const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { whatsappAccessToken: true } });
    if (!loc?.whatsappAccessToken) return { error: "That location has no WhatsApp access token saved." };
    if (!wabaId) return { error: "Enter the WhatsApp Business Account ID for that location." };
    return { wabaId, token: loc.whatsappAccessToken };
  }
  const id = wabaId || process.env.WHATSAPP_SHARED_WABA_ID, token = process.env.WHATSAPP_SHARED_ACCESS_TOKEN;
  if (!id || !token) return { error: "Set WHATSAPP_SHARED_WABA_ID and WHATSAPP_SHARED_ACCESS_TOKEN on the server first." };
  return { wabaId: id, token };
}

export async function GET(req: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const a = await account(req.nextUrl.searchParams.get("locationId"), req.nextUrl.searchParams.get("wabaId"));
  if ("error" in a) return NextResponse.json({ templates: mergeStatus([]), error: a.error });
  try {
    return NextResponse.json({ templates: mergeStatus(await listMetaTemplates(a.wabaId, a.token)), wabaId: a.wabaId });
  } catch (err) {
    return NextResponse.json({ templates: mergeStatus([]), error: err instanceof Error ? err.message : String(err) });
  }
}

const bodySchema = z.object({ locationId: z.string().optional(), wabaId: z.string().regex(/^\d+$/).optional() });

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const a = await account(parsed.data.locationId, parsed.data.wabaId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: 400 });
  try {
    const results = await submitAllTemplates(a.wabaId, a.token);
    const failed = results.filter((r) => r.result === "FAILED").length;
    await logEvent({ source: "WHATSAPP", level: failed ? "WARN" : "INFO", message: `WhatsApp templates submitted to ${a.wabaId}: ${results.filter((r) => r.result === "SUBMITTED").length} new, ${failed} failed`, meta: { failed: results.filter((r) => r.result === "FAILED") } });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
