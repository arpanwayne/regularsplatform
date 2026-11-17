import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { slugify } from "@/lib/hub/catalog-rules";
import { productFields } from "@/lib/hub/catalog-schemas";

/**
 * POST /api/admin/catalog/products — add a product to the catalog.
 * New products are MANUAL: our team sets each client up, the client opens it
 * by link. Automatic set-up + one login needs code in that product (see
 * docs/PRODUCTS-AND-BUNDLES.md).
 */
export async function POST(req: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object(productFields).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  let key = slugify(parsed.data.name);
  for (let i = 2; await prisma.product.findUnique({ where: { key }, select: { id: true } }); i++) key = `${slugify(parsed.data.name)}-${i}`;
  const product = await prisma.product.create({ data: { ...parsed.data, key, connect: "MANUAL", builtIn: false } });
  return NextResponse.json({ product });
}
