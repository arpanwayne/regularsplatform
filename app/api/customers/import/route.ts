import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { parseCsv } from "@/lib/csv";
import { normalizePhone } from "@/lib/phone";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";

const MAX_ROWS = 5000;
const pick = (row: Record<string, string>, ...keys: string[]) => keys.map((k) => row[k]).find((v) => v) ?? "";

/**
 * POST /api/customers/import?locationId=...  (body: the CSV text)
 * Imports a client's existing customer list so win-backs and review requests
 * work from day one. Columns (case-insensitive, extras ignored):
 *   phone (required), name, last_visit (date), visits, total_spend, channel (sms|whatsapp)
 * Existing customers are updated, never duplicated (one per location + phone).
 * Imported customers have dealt with the business, which is the CASL basis for
 * implied consent — the opt-out footer still goes on every text.
 */
export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = req.nextUrl.searchParams.get("locationId");
  const location = locationId
    ? await prisma.location.findFirst({ where: { id: locationId, businessId: business.id } })
    : await prisma.location.findFirst({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const rows = parseCsv(await req.text());
  if (!rows.length) return NextResponse.json({ error: "CSV is empty — first row must be the header" }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Max ${MAX_ROWS} rows per import` }, { status: 400 });

  let created = 0, updated = 0;
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    const phone = normalizePhone(pick(row, "phone", "mobile", "phone_number", "cell"), business.country);
    if (!phone) { if (errors.length < 20) errors.push(`Row ${i + 2}: invalid phone`); continue; }
    const name = pick(row, "name", "full_name", "customer", "customer_name") || null;
    const lastVisitRaw = pick(row, "last_visit", "last_visit_date", "last_seen", "date");
    const lastVisit = lastVisitRaw ? new Date(lastVisitRaw) : null;
    if (lastVisit && Number.isNaN(lastVisit.getTime())) { if (errors.length < 20) errors.push(`Row ${i + 2}: can't read last_visit "${lastVisitRaw}"`); }
    const when = lastVisit && !Number.isNaN(lastVisit.getTime()) && lastVisit <= new Date() ? lastVisit : null;
    const visits = parseInt(pick(row, "visits", "visit_count"), 10);
    const spend = parseFloat(pick(row, "total_spend", "spend", "amount").replace(/[^0-9.]/g, ""));
    const ch = pick(row, "channel", "preferred_channel").toUpperCase();
    const channel = ch === "SMS" || ch === "WHATSAPP" ? ch : null;

    const existing = await prisma.customer.findUnique({ where: { locationId_phone: { locationId: location.id, phone } } });
    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: {
          name: existing.name ?? name,
          ...(when && when > existing.lastSeenAt ? { lastSeenAt: when } : {}),
          ...(Number.isFinite(visits) && visits > existing.visitCount ? { visitCount: visits } : {}),
          ...(Number.isFinite(spend) && spend > existing.totalSpend ? { totalSpend: spend } : {}),
          ...(channel ? { preferredChannel: channel } : {}),
        },
      });
      updated++;
    } else {
      await prisma.customer.create({
        data: {
          businessId: business.id, locationId: location.id, phone, name,
          firstSeenAt: when ?? new Date(), lastSeenAt: when ?? new Date(),
          visitCount: Number.isFinite(visits) ? visits : when ? 1 : 0,
          totalSpend: Number.isFinite(spend) ? spend : 0,
          preferredChannel: channel,
        },
      });
      created++;
    }
  }
  await runSegmentationForBusiness(business.id);
  return NextResponse.json({ rows: rows.length, created, updated, skipped: rows.length - created - updated, errors });
}
