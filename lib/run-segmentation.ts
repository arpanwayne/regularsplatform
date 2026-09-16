import { prisma } from "@/lib/prisma";
import { computeSegment, computeSpendPercentileThreshold, DEFAULT_THRESHOLDS } from "@/lib/segmentation";

/**
 * Recomputes the segment for every customer of a business. Called after
 * webhook ingestion (for the affected customer) and can also be run in bulk
 * from the dashboard or a scheduled job to pick up pure recency-based
 * transitions (e.g. someone quietly going dormant with no new messages).
 */
export async function runSegmentationForBusiness(businessId: string) {
  const [business, customers] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.customer.findMany({ where: { businessId } }),
  ]);
  const spendThreshold = computeSpendPercentileThreshold(customers.map((c) => c.totalSpend));

  // A super admin can override any of these per business (see /admin);
  // null means "use the platform default".
  const thresholds = {
    atRiskAfterDays: business.atRiskAfterDaysOverride ?? DEFAULT_THRESHOLDS.atRiskAfterDays,
    dormantAfterDays: business.dormantAfterDaysOverride ?? DEFAULT_THRESHOLDS.dormantAfterDays,
    establishedVisitCount:
      business.establishedVisitCountOverride ?? DEFAULT_THRESHOLDS.establishedVisitCount,
  };

  const updates = customers.map((c) => {
    const segment = computeSegment(
      {
        visitCount: c.visitCount,
        totalSpend: c.totalSpend,
        lastSeenAt: c.lastSeenAt,
        firstSeenAt: c.firstSeenAt,
      },
      spendThreshold,
      thresholds
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
