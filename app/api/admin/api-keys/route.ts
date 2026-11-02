import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/admin";
import { generateApiKey } from "@/lib/api-keys";
import { logEvent } from "@/lib/logger";

const createSchema = z.object({
  businessId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
});

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true,
      business: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ keys });
}

/** Issues a key. The plaintext is returned once and never stored. */
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const business = await prisma.business.findUnique({ where: { id: parsed.data.businessId } });
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { plain, keyHash, keyPrefix } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: { businessId: business.id, name: parsed.data.name, keyHash, keyPrefix },
    select: { id: true, name: true, keyPrefix: true, createdAt: true },
  });

  await logEvent({
    businessId: business.id,
    source: "API",
    level: "INFO",
    message: `API key "${key.name}" (${keyPrefix}…) issued by ${admin.email}`,
  });

  return NextResponse.json({ key: { ...key, plaintext: plain } }, { status: 201 });
}
