import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { logEvent } from "@/lib/logger";
import { syncBundle, withHub } from "@/lib/hub/catalog";
import { bundleFields } from "@/lib/hub/catalog-schemas";

const updateSchema = z.object({
  ...bundleFields,
  name: bundleFields.name.optional(),
  productIds: bundleFields.productIds.optional(),
  active: z.boolean().optional(),
});

/**
 * PATCH — edit a bundle. Clients already on it get the change straight away:
 * new connected software is set up, removed software is paused (never deleted).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const bundle = await prisma.bundle.findUnique({ where: { id: params.id } });
  if (!bundle) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { productIds, ...data } = parsed.data;
  await prisma.$transaction(async (tx) => {
    await tx.bundle.update({ where: { id: bundle.id }, data });
    if (productIds) {
      const ids = await withHub(productIds);
      await tx.bundleProduct.deleteMany({ where: { bundleId: bundle.id, productId: { notIn: ids } } });
      for (const productId of ids) {
        await tx.bundleProduct.upsert({ where: { bundleId_productId: { bundleId: bundle.id, productId } }, create: { bundleId: bundle.id, productId }, update: {} });
      }
    }
  });
  const synced = await syncBundle(bundle.id);
  await logEvent({ source: "BILLING", level: "INFO", message: `Admin ${admin.email} edited bundle "${data.name ?? bundle.name}" (${synced.businesses} client(s) updated)` });
  return NextResponse.json({ ok: true, clientsUpdated: synced.businesses });
}

/** DELETE — only a bundle no client has. Otherwise switch it off (clients keep it, nobody new gets it). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const bundle = await prisma.bundle.findUnique({ where: { id: params.id }, include: { _count: { select: { businesses: true } } } });
  if (!bundle) return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  if (bundle._count.businesses) return NextResponse.json({ error: `${bundle._count.businesses} client(s) are on this bundle. Switch it off instead.` }, { status: 409 });
  await prisma.bundle.delete({ where: { id: bundle.id } });
  return NextResponse.json({ ok: true });
}
