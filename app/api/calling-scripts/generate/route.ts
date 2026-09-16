import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { generateCallingScript } from "@/lib/calling-scripts/generate";

const schema = z.object({ customerId: z.string() });

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { id: parsed.data.customerId, businessId: business.id },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (customer.optedOut) {
    return NextResponse.json(
      { error: "Customer has opted out of WhatsApp/calling outreach" },
      { status: 409 }
    );
  }

  const script = await generateCallingScript(business, customer);

  const record = await prisma.callingScript.create({
    data: {
      businessId: business.id,
      sector: business.sector,
      segment: customer.segment,
      title: script.title,
      content: script.content,
      isDefault: false,
    },
  });

  return NextResponse.json({ script: record, aiPersonalized: script.aiPersonalized });
}
