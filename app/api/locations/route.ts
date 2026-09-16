import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
});

export async function GET() {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locations = await prisma.location.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ locations });
}

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Location name required" }, { status: 400 });
  }

  const location = await prisma.location.create({
    data: {
      businessId: business.id,
      name: parsed.data.name,
      address: parsed.data.address,
    },
  });

  return NextResponse.json({ location });
}
