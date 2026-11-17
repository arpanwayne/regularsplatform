import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { DAY, parseJson } from "@/lib/growth/settings";

/**
 * Delivery receipts → Growth Manager actions.
 *
 * WhatsApp and Twilio accept a message first and only report later (on the
 * status webhook) that it never reached the customer. The executor marks the
 * action DONE when the message is accepted, so without this step a message
 * Meta blocked still showed "Done" on the Growth AI page (bug B1) and the
 * learned win rates counted it as a real attempt.
 *
 * Meta 131049 (marketing message held back for "healthy ecosystem
 * engagement") is temporary: the action goes back to APPROVED with
 * retryAfter = +24h and is tried once more (bug B4). Anything else, or a
 * second 131049, leaves the action FAILED with the reason the owner sees.
 */

/** Meta error codes worth one retry the next day. */
export const RETRY_NEXT_DAY_CODES = [131049];

export type FailedDelivery = { messageId: string; code?: number | null; reason: string; now?: Date };

/** Finds the action that sent `messageId` (its result JSON carries the messageId). */
async function actionForMessage(messageId: string) {
  return prisma.growthAction.findFirst({
    where: { status: "DONE", result: { contains: `"messageId":"${messageId}"` } },
    orderBy: { executedAt: "desc" },
  });
}

/** Returns what happened to the linked action, or null when the message wasn't sent by the Growth Manager. */
export async function onMessageDeliveryFailed(f: FailedDelivery): Promise<"RETRY" | "FAILED" | null> {
  const action = await actionForMessage(f.messageId);
  if (!action) return null;
  const now = f.now ?? new Date();
  const payload = parseJson<Record<string, unknown>>(action.payload, {});
  const retry = f.code != null && RETRY_NEXT_DAY_CODES.includes(f.code) && !payload.retried;

  if (retry) {
    const retryAfter = new Date(now.getTime() + DAY).toISOString();
    await prisma.growthAction.update({
      where: { id: action.id },
      data: {
        status: "APPROVED", executedAt: null, outcome: null,
        error: `${f.reason} Trying once more after ${retryAfter.slice(0, 16).replace("T", " ")} UTC.`.slice(0, 500),
        payload: JSON.stringify({ ...payload, retryAfter, retried: true }),
      },
    });
    // A win-back that never arrived must not block the next one for 30 days.
    if (action.type === "WIN_BACK" && action.customerId) {
      await prisma.customer.update({ where: { id: action.customerId }, data: { lastWinbackAt: null } }).catch(() => {});
    }
    await logEvent({ businessId: action.businessId, source: "GROWTH", level: "WARN", message: `"${action.title}" was not delivered; it will be retried once tomorrow`, meta: { actionId: action.id, code: f.code } });
    return "RETRY";
  }

  await prisma.growthAction.update({
    where: { id: action.id },
    data: { status: "FAILED", outcome: null, error: `Not delivered: ${f.reason}`.slice(0, 500) },
  });
  if (action.type === "WIN_BACK" && action.customerId) {
    await prisma.customer.update({ where: { id: action.customerId }, data: { lastWinbackAt: null } }).catch(() => {});
  }
  await logEvent({ businessId: action.businessId, source: "GROWTH", level: "WARN", message: `"${action.title}" was not delivered — marked Failed`, meta: { actionId: action.id, code: f.code } });
  return "FAILED";
}
