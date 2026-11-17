import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { bundleFields } from "@/lib/hub/catalog-schemas";
import { withHub } from "@/lib/hub/catalog";

/** POST /api/admin/catalog/bundles — build a bundle from any products in the catalog. */
export async function POST(req: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object(bundleFields).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { productIds, ...data } = parsed.data;
  const ids = await withHub(productIds);
  const bundle = await prisma.bundle.create({ data: { ...data, items: { create: ids.map((productId) => ({ productId })) } } });
  return NextResponse.json({ bundle });
}
