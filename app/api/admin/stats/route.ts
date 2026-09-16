import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    totalBusinesses,
    activeBusinesses,
    connectedToWhatsapp,
    totalCustomers,
    segmentCounts,
    callLogCounts,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { status: "ACTIVE" } }),
    prisma.location.count({ where: { whatsappPhoneNumberId: { not: null } } }),
    prisma.customer.count(),
    prisma.customer.groupBy({ by: ["segment"], _count: true }),
    prisma.callLog.groupBy({ by: ["status"], _count: true }),
  ]);

  return NextResponse.json({
    totalBusinesses,
    activeBusinesses,
    suspendedBusinesses: totalBusinesses - activeBusinesses,
    connectedToWhatsapp,
    totalCustomers,
    segmentCounts: Object.fromEntries(segmentCounts.map((s) => [s.segment, s._count])),
    callLogCounts: Object.fromEntries(callLogCounts.map((c) => [c.status, c._count])),
  });
}
