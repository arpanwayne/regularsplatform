import { Business, Customer } from "@prisma/client";
import { getTemplate } from "@/lib/calling-scripts/templates";
import type { Sector, Segment } from "@/lib/types";
import { estimateClaudeCostUsd, recordUsageEvent } from "@/lib/usage";
import { logEvent } from "@/lib/logger";

function fillPlaceholders(content: string, vars: Record<string, string>): string {
  return content.replace(/{{\s*(\w+)\s*}}/g, (_, key) => vars[key] ?? "");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Optionally asks Claude to lightly personalize the static template with
 * the customer's actual visit history, while keeping it Hinglish and the
 * same rough length/tone. Silently falls back to the filled static
 * template when ANTHROPIC_API_KEY isn't configured or the call fails —
 * the platform must keep working without this key (see PDF: "zero manual
 * effort", not "zero effort unless an API is down").
 */
type ClaudePersonalizeResult = { text: string; inputTokens: number; outputTokens: number };

async function personalizeWithClaude(
  baseScript: string,
  context: { customerName: string; businessName: string; sector: string; segment: string },
  businessId: string
): Promise<ClaudePersonalizeResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content:
              `Yeh ek Hinglish AI calling script hai jo ek ${context.sector} business ` +
              `apne "${context.segment}" segment ke customer "${context.customerName}" ko call karne ` +
              `ke liye use karega (business ka naam: "${context.businessName}"). ` +
              `Isi tone aur length mein thoda naturally personalize kar do, Hinglish mein hi rakho, ` +
              `aur sirf final script text return karo, koi extra explanation nahi:\n\n${baseScript}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      await logEvent({
        businessId,
        source: "CALLING_SCRIPT",
        level: "WARN",
        message: `Claude personalization request failed (HTTP ${res.status})`,
      });
      return null;
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) return null;
    return {
      text: text.trim(),
      inputTokens: data?.usage?.input_tokens ?? 0,
      outputTokens: data?.usage?.output_tokens ?? 0,
    };
  } catch (err) {
    await logEvent({
      businessId,
      source: "CALLING_SCRIPT",
      level: "WARN",
      message: "Claude personalization request threw an error",
      meta: { error: err instanceof Error ? err.message : String(err) },
    });
    return null;
  }
}

export async function generateCallingScript(
  business: Pick<Business, "id" | "name" | "sector">,
  customer: Pick<Customer, "name" | "phone" | "lastSeenAt" | "segment">
) {
  const template = getTemplate(business.sector as Sector, customer.segment as Segment);
  const vars = {
    customerName: customer.name || "Customer",
    businessName: business.name,
    lastVisitDate: formatDate(customer.lastSeenAt),
  };
  const filled = fillPlaceholders(template.content, vars);

  const personalized = await personalizeWithClaude(
    filled,
    {
      customerName: vars.customerName,
      businessName: vars.businessName,
      sector: business.sector,
      segment: customer.segment,
    },
    business.id
  );

  if (personalized) {
    const estimatedCostUsd = estimateClaudeCostUsd(
      personalized.inputTokens,
      personalized.outputTokens
    );
    await recordUsageEvent({
      businessId: business.id,
      type: "AI_SCRIPT_PERSONALIZATION",
      inputTokens: personalized.inputTokens,
      outputTokens: personalized.outputTokens,
      estimatedCostUsd,
    });
  }

  return {
    title: template.title,
    content: personalized?.text ?? filled,
    aiPersonalized: personalized !== null,
  };
}
