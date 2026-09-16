import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const businesses = await prisma.business.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { customers: true, callLogs: true, locations: true } },
      locations: { select: { whatsappPhoneNumberId: true } },
    },
  });

  const rows = businesses.map((b) => ({
    ...b,
    connectedLocations: b.locations.filter((l) => l.whatsappPhoneNumberId).length,
  }));

  return NextResponse.json({ businesses: rows });
}
