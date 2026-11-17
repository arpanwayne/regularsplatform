import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { syncBundle } from "@/lib/hub/catalog";
import { productFields } from "@/lib/hub/catalog-schemas";

const updateSchema = z.object({
  ...productFields,
  name: productFields.name.optional(),
  active: z.boolean().optional(),
});

/** PATCH — edit a product. How built-in tools connect can't be changed here (that's code). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const product = await prisma.product.findUnique({ where: { id: params.id }, include: { bundles: { select: { bundleId: true } } } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (product.connect === "HUB" && parsed.data.active === false) {
    return NextResponse.json({ error: "Regulars is the hub of every bundle and can't be switched off." }, { status: 409 });
  }
  const updated = await prisma.product.update({ where: { id: product.id }, data: parsed.data });
  // Switching a connected tool off/on changes what clients on those bundles get.
  if (parsed.data.active !== undefined && parsed.data.active !== product.active) {
    for (const b of product.bundles) await syncBundle(b.bundleId);
  }
  return NextResponse.json({ product: updated });
}

/** DELETE — only a product we added ourselves and that no bundle uses. Otherwise switch it off. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const product = await prisma.product.findUnique({ where: { id: params.id }, include: { _count: { select: { bundles: true, setups: true } } } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (product.builtIn) return NextResponse.json({ error: "Built-in software can't be deleted. Switch it off instead." }, { status: 409 });
  if (product._count.bundles || product._count.setups) {
    return NextResponse.json({ error: "This software is in a bundle or set up for a client. Take it out of the bundles first, or switch it off." }, { status: 409 });
  }
  await prisma.product.delete({ where: { id: product.id } });
  return NextResponse.json({ ok: true });
}
