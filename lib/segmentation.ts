import { Segment } from "@/lib/types";

// Rule-based behavioral segmentation, per the PDF spec: "AI customer ke
// behavior ko analyze karke unhe segments mein daalta hai (regular, at-risk,
// high spender, dormant) based on unke visit/purchase patterns."
//
// This is deterministic and explainable by design (see README "Segmentation
// logic" section — the PDF flags this as previously undocumented). It can
// later be swapped for a learned model without changing the call sites,
// since everything downstream only depends on the returned Segment enum.

export type CustomerStats = {
  visitCount: number;
  totalSpend: number;
  lastSeenAt: Date;
  firstSeenAt: Date;
};

export type SegmentationThresholds = {
  /** Days since last visit after which a previously active customer is at-risk. */
  atRiskAfterDays: number;
  /** Days since last visit after which a customer is considered dormant. */
  dormantAfterDays: number;
  /** Minimum visits to be considered an established (non-new) customer. */
  establishedVisitCount: number;
};

export const DEFAULT_THRESHOLDS: SegmentationThresholds = {
  atRiskAfterDays: 30,
  dormantAfterDays: 60,
  establishedVisitCount: 3,
};

function daysSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Computes a single customer's segment. `businessSpendPercentileThreshold`
 * is the business-wide spend value at the configured percentile (e.g. p80);
 * pass `null` when there isn't enough business data yet to rank spend.
 */
export function computeSegment(
  stats: CustomerStats,
  businessSpendPercentileThreshold: number | null,
  thresholds: SegmentationThresholds = DEFAULT_THRESHOLDS,
  now: Date = new Date()
): Segment {
  const recencyDays = daysSince(stats.lastSeenAt, now);
  const isEstablished = stats.visitCount >= thresholds.establishedVisitCount;

  if (recencyDays > thresholds.dormantAfterDays) {
    return "DORMANT";
  }

  if (
    businessSpendPercentileThreshold !== null &&
    stats.totalSpend > 0 &&
    stats.totalSpend >= businessSpendPercentileThreshold
  ) {
    return "HIGH_SPENDER";
  }

  if (recencyDays > thresholds.atRiskAfterDays && isEstablished) {
    return "AT_RISK";
  }

  if (isEstablished && recencyDays <= thresholds.atRiskAfterDays) {
    return "REGULAR";
  }

  return "NEW";
}

/** p80 spend across a business's customers, used as the "high spender" cutoff. */
export function computeSpendPercentileThreshold(
  allSpends: number[],
  percentile = 0.8
): number | null {
  const positive = allSpends.filter((s) => s > 0).sort((a, b) => a - b);
  if (positive.length < 5) {
    // Too few data points for a meaningful percentile — skip high-spender
    // classification rather than flag everyone.
    return null;
  }
  const index = Math.min(positive.length - 1, Math.floor(percentile * positive.length));
  return positive[index];
}
