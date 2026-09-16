import { prisma } from "@/lib/prisma";
import type { UsageEventType } from "@/lib/types";

// Approximate Claude Haiku per-token pricing (USD per token), used only to
// give a rough cost estimate in the admin panel — NOT a billing-grade
// figure. Verify current rates at https://www.anthropic.com/pricing before
// relying on this for real cost accounting.
const CLAUDE_HAIKU_INPUT_USD_PER_TOKEN = 1 / 1_000_000;
const CLAUDE_HAIKU_OUTPUT_USD_PER_TOKEN = 5 / 1_000_000;

export function estimateClaudeCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    inputTokens * CLAUDE_HAIKU_INPUT_USD_PER_TOKEN +
    outputTokens * CLAUDE_HAIKU_OUTPUT_USD_PER_TOKEN
  );
}

/**
 * Records one usage event. Failures here must never break the calling
 * script/voice-call flow they're tracking — usage tracking is
 * observability, not a critical path — so this swallows its own errors.
 */
export async function recordUsageEvent(params: {
  businessId: string;
  type: UsageEventType;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  callTriggered?: boolean;
}) {
  try {
    await prisma.usageEvent.create({
      data: {
        businessId: params.businessId,
        type: params.type,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCostUsd: params.estimatedCostUsd,
        callTriggered: params.callTriggered,
      },
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
