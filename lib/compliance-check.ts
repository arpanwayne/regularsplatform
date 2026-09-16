import { prisma } from "@/lib/prisma";

export type ComplianceCheckResult = {
  id: string;
  level: "PASS" | "WARN" | "FAIL";
  scope: "PLATFORM" | string; // "PLATFORM" or a business name
  title: string;
  detail: string;
};

/**
 * Automated stand-in for the "WhatsApp Business API compliance manual
 * review" roadmap item. It cannot replace an actual human review of your
 * live Meta Business Manager setup (opt-in policy, 24-hour messaging
 * window, template category approval — see COMPLIANCE.md) since those
 * live on Meta's side, not in this database. What it CAN do, and does
 * here, is verify every compliance-relevant fact this codebase actually
 * controls: is signature verification on, is any location misconfigured,
 * and — the one a bug or a bypass could actually violate — has an
 * opted-out customer ever been sent outreach despite the guard in
 * app/api/calling-scripts/*.
 */
export async function runComplianceChecks(): Promise<ComplianceCheckResult[]> {
  const results: ComplianceCheckResult[] = [];

  // Platform-level: webhook signature verification.
  if (process.env.WHATSAPP_APP_SECRET) {
    results.push({
      id: "webhook-signature",
      level: "PASS",
      scope: "PLATFORM",
      title: "Webhook signature verification",
      detail: "WHATSAPP_APP_SECRET is set — inbound webhook requests are verified as genuinely from Meta.",
    });
  } else {
    results.push({
      id: "webhook-signature",
      level: "WARN",
      scope: "PLATFORM",
      title: "Webhook signature verification",
      detail:
        "WHATSAPP_APP_SECRET is not set — the webhook currently accepts any POST without verifying " +
        "it came from Meta. Fine for local setup, set this before handling real customer data.",
    });
  }

  const businesses = await prisma.business.findMany({
    include: { locations: true },
  });

  for (const business of businesses) {
    const misconfiguredLocations = business.locations.filter(
      (l) => l.whatsappPhoneNumberId && !l.whatsappAccessToken
    );
    if (misconfiguredLocations.length > 0) {
      results.push({
        id: `misconfigured-${business.id}`,
        level: "WARN",
        scope: business.name,
        title: "Location has a phone number ID but no access token",
        detail: `${misconfiguredLocations.map((l) => l.name).join(", ")} — outbound WhatsApp API calls will fail until an access token is added in Settings.`,
      });
    }

    // Integrity check: the only way this should ever find a row is a bug
    // in the opted-out guard (app/api/calling-scripts/*) or a direct DB
    // write that bypassed it — this isn't reachable through normal use.
    const violatingCallLogs = await prisma.callLog.count({
      where: { businessId: business.id, customer: { optedOut: true } },
    });
    if (violatingCallLogs > 0) {
      results.push({
        id: `optout-violation-${business.id}`,
        level: "FAIL",
        scope: business.name,
        title: "Calling script(s) targeted an opted-out customer",
        detail: `${violatingCallLogs} CallLog row(s) exist for customers who are opted out — this should be impossible through the app; investigate for a bypass or data-migration issue.`,
      });
    }

    const optedOutCount = await prisma.customer.count({
      where: { businessId: business.id, optedOut: true },
    });
    if (optedOutCount > 0 && violatingCallLogs === 0) {
      results.push({
        id: `optout-respected-${business.id}`,
        level: "PASS",
        scope: business.name,
        title: "Opt-outs are being respected",
        detail: `${optedOutCount} customer(s) opted out; none have been targeted since.`,
      });
    }
  }

  return results;
}
