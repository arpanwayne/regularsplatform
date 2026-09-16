import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const level = req.nextUrl.searchParams.get("level");
  const logs = await prisma.systemLog.findMany({
    where: level ? { level } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { business: { select: { name: true } } },
  });

  return NextResponse.json({ logs });
}
