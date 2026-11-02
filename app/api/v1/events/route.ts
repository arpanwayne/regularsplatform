import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { batchSchema, ingestEvents } from "@/lib/ingest-events";
import { logEvent } from "@/lib/logger";

/**
 * POST /api/v1/events — server-to-server event ingestion.
 *
 * Auth:  Authorization: Bearer rk_live_...   (issued in /admin/api-keys)
 * Body:  { "events": [ { "type": "VISIT", "phone": "919876543210",
 *          "name": "Asha", "occurredAt": "2026-11-02T10:00:00+05:30",
 *          "amount": 500, "externalId": "rx:abc123" } ] }   (1–100 events)
 * Reply: 200 { summary: { created, updated, duplicate, rejected }, results: [...] }
 *
 * Partial success is normal: each event has its own result. Safe to retry —
 * VISIT events are idempotent on externalId.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  if (auth.suspended) return NextResponse.json({ error: "Business is suspended" }, { status: 403 });

  const parsed = batchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body must be { events: [...] } with 1–100 events" }, { status: 400 });
  }

  try {
    const result = await ingestEvents(auth.business, parsed.data.events, `api:${auth.apiKey.keyPrefix}`);
    if (result.summary.rejected > 0) {
      await logEvent({
        businessId: auth.business.id,
        source: "API",
        level: "WARN",
        message: `Events API: ${result.summary.rejected} of ${parsed.data.events.length} event(s) rejected`,
        meta: {
          apiKeyId: auth.apiKey.id,
          errors: result.results.filter((r) => r.status === "rejected").slice(0, 5),
        },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    await logEvent({
      businessId: auth.business.id,
      source: "API",
      level: "ERROR",
      message: "Events API batch failed",
      meta: { apiKeyId: auth.apiKey.id, error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
