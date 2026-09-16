import { prisma } from "@/lib/prisma";
import { computeSegment, computeSpendPercentileThreshold } from "@/lib/segmentation";

/**
 * Recomputes the segment for every customer of a business. Called after
 * webhook ingestion (for the affected customer) and can also be run in bulk
 * from the dashboard or a scheduled job to pick up pure recency-based
 * transitions (e.g. someone quietly going dormant with no new messages).
 */
export async function runSegmentationForBusiness(businessId: string) {
  const customers = await prisma.customer.findMany({ where: { businessId } });
  const spendThreshold = computeSpendPercentileThreshold(customers.map((c) => c.totalSpend));

  const updates = customers.map((c) => {
    const segment = computeSegment(
      {
        visitCount: c.visitCount,
        totalSpend: c.totalSpend,
        lastSeenAt: c.lastSeenAt,
        firstSeenAt: c.firstSeenAt,
      },
      spendThreshold
    );
    return { id: c.id, segment };
  });

  const changed = updates.filter((u, i) => u.segment !== customers[i].segment);

  await prisma.$transaction(
    changed.map((u) =>
      prisma.customer.update({
        where: { id: u.id },
        data: { segment: u.segment, segmentUpdatedAt: new Date() },
      })
    )
  );

  return { total: customers.length, changed: changed.length };
}

export async function runSegmentationForCustomer(customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  return runSegmentationForBusiness(customer.businessId);
}
