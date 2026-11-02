import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { logEvent } from "@/lib/logger";

/** DELETE /api/admin/api-keys/:id — revokes a key immediately (kept for audit). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const key = await prisma.apiKey.findUnique({ where: { id: params.id } });
  if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });
  if (key.revokedAt) return NextResponse.json({ ok: true });

  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await logEvent({
    businessId: key.businessId,
    source: "API",
    level: "INFO",
    message: `API key "${key.name}" (${key.keyPrefix}…) revoked by ${admin.email}`,
  });
  return NextResponse.json({ ok: true });
}
