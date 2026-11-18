import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnerBusiness } from "@/lib/session";
import { logEvent } from "@/lib/logger";

/** Removes a manager's login (owner only). Their offers stay, without a creator. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const business = await getOwnerBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const manager = await prisma.user.findFirst({ where: { id: params.id, managedBusinessId: business.id, role: "MANAGER" } });
  if (!manager) return NextResponse.json({ error: "Manager not found" }, { status: 404 });
  await prisma.user.delete({ where: { id: manager.id } });
  await logEvent({ businessId: business.id, source: "AUTH", level: "INFO", message: `Manager removed: ${manager.email}` });
  return NextResponse.json({ ok: true });
}
