import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  whatsappPhoneNumberId: z.string().min(1).optional(),
  whatsappAccessToken: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const location = await prisma.location.findFirst({
    where: { id: params.id, businessId: business.id },
  });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.location.update({
    where: { id: location.id },
    data: parsed.data,
  });

  return NextResponse.json({ location: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [location, locationCount] = await Promise.all([
    prisma.location.findFirst({ where: { id: params.id, businessId: business.id } }),
    prisma.location.count({ where: { businessId: business.id } }),
  ]);
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  if (locationCount <= 1) {
    return NextResponse.json(
      { error: "Can't delete the only location — a business needs at least one" },
      { status: 400 }
    );
  }

  await prisma.location.delete({ where: { id: location.id } });
  return NextResponse.json({ ok: true });
}
