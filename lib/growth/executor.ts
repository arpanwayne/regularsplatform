import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { sendReviewRequest, sendToCustomer } from "@/lib/front-desk";
import { gmb, ToolError, videoStudio, wayneRing } from "@/lib/growth/connectors";
import { templateCopy } from "@/lib/growth/copy";
import { getSettings, parseJson, withinContactHours } from "@/lib/growth/settings";
import { CUSTOMER_CONTACT, type ActionType } from "@/lib/growth/types";
import type { MessagePurpose } from "@/lib/types";

/**
 * ACT: runs one APPROVED action with the right tool.
 *
 *   calls            → WayneRing AI callback (falls back to a text if the call isn't allowed)
 *   texts            → lib/front-desk sendToCustomer (WhatsApp template or SMS, opt-outs enforced)
 *   review request   → lib/front-desk sendReviewRequest
 *   review reply     → GMB Manager publishes the reply on Google
 *   Google post      → GMB Manager generates + publishes
 *   promo Reel       → AI Video Studio job (the team reviews before posting)
 *
 * Customer contact only happens inside the business's contact hours; outside
 * them the action simply stays APPROVED until the next run.
 */

type Payload = {
  channel?: "CALL" | "TEXT"; purpose?: string; relationship?: "caller" | "customer"; context?: string; message?: string;
  reviewId?: string; reply?: string; postType?: "update" | "offer"; prompt?: string; ctaUrl?: string | null;
  name?: string; brief?: string; overlay?: string; quoteValue?: number;
};

const TEXT_PURPOSE: Partial<Record<ActionType, MessagePurpose>> = {
  WIN_BACK: "WINBACK", SERVICE_DUE: "FOLLOW_UP", QUOTE_FOLLOW_UP: "FOLLOW_UP", MISSED_LEAD_CALLBACK: "FOLLOW_UP",
};

export type ExecResult = { id: string; status: "DONE" | "FAILED" | "SKIPPED" | "DEFERRED" | "NOT_APPROVED"; detail?: string };

export async function executeAction(actionId: string, now = new Date()): Promise<ExecResult> {
  const action = await prisma.growthAction.findUnique({ where: { id: actionId }, include: { customer: true } });
  if (!action) return { id: actionId, status: "FAILED", detail: "not found" };
  if (action.status !== "APPROVED") return { id: actionId, status: "NOT_APPROVED" };

  const business = await prisma.business.findUniqueOrThrow({ where: { id: action.businessId }, include: { locations: true } });
  const s = await getSettings(business);
  const type = action.type as ActionType;
  const p = parseJson<Payload>(action.payload, {});
  const contact = CUSTOMER_CONTACT.includes(type);

  if (business.status !== "ACTIVE") return { id: action.id, status: "DEFERRED", detail: "business suspended" };
  if (contact && !withinContactHours(s, now)) return { id: action.id, status: "DEFERRED", detail: "outside contact hours" };
  const c = action.customer;
  if (contact && (!c || c.optedOut)) {
    await prisma.growthAction.update({ where: { id: action.id }, data: { status: "SKIPPED", error: "Customer opted out or removed" } });
    return { id: action.id, status: "SKIPPED", detail: "opted out" };
  }

  // Claim it (two cron runs or a cron + an owner reply can't both execute it).
  const claimed = await prisma.growthAction.updateMany({ where: { id: action.id, status: "APPROVED" }, data: { status: "EXECUTING" } });
  if (claimed.count === 0) return { id: action.id, status: "NOT_APPROVED" };

  const location = business.locations.find((l) => l.id === (c?.locationId ?? action.locationId)) ?? business.locations[0];
  const done = async (result: unknown) => {
    await prisma.growthAction.update({ where: { id: action.id }, data: { status: "DONE", executedAt: now, result: JSON.stringify(result ?? {}).slice(0, 4000), error: null } });
    return { id: action.id, status: "DONE" as const };
  };
  const fail = async (error: string, back?: "APPROVED") => {
    await prisma.growthAction.update({ where: { id: action.id }, data: { status: back ?? "FAILED", error: error.slice(0, 500) } });
    return { id: action.id, status: back ? ("DEFERRED" as const) : ("FAILED" as const), detail: error };
  };
  const sendText = async () => {
    const text = p.message || templateCopy({ id: action.id, type, firstName: (c?.name ?? "").split(" ")[0], context: "", bookingUrl: location.bookingUrl });
    const r = await sendToCustomer(business, location, c!, TEXT_PURPOSE[type] ?? "FOLLOW_UP", text, [(c?.name ?? "").split(" ")[0] || "there", location.bookingUrl ?? ""]);
    return r;
  };

  try {
    switch (type) {
      case "MISSED_LEAD_CALLBACK":
      case "QUOTE_FOLLOW_UP":
      case "SERVICE_DUE":
      case "WIN_BACK": {
        if (p.channel === "CALL" && wayneRing.available(s)) {
          try {
            const r = await wayneRing.callback(s, {
              phone: c!.phone, name: c!.name, purpose: (p.purpose as "MISSED_LEAD") ?? "MISSED_LEAD",
              context: p.context, relationship: p.relationship ?? "customer", actionId: action.id,
            });
            return await done({ tool: "wayneRing", ...r });
          } catch (err) {
            if (err instanceof ToolError && err.code === "OUTSIDE_HOURS") return await fail(`Call waits until ${err.retryAt ?? "calling hours"}`, "APPROVED");
            if (!(err instanceof ToolError && ["NO_RELATIONSHIP", "RECENTLY_CALLED", "NO_NUMBER", "NOT_ACTIVE"].includes(err.code))) throw err;
            // Call not allowed / not possible → send the text instead.
          }
        }
        const r = await sendText();
        if (!r.ok) return await fail(`Text not sent: ${r.status}`);
        if (type === "WIN_BACK") await prisma.customer.update({ where: { id: c!.id }, data: { lastWinbackAt: now } });
        return await done({ tool: "text", ...r });
      }
      case "REVIEW_REQUEST": {
        const r = await sendReviewRequest(business, location, c!, now);
        return r.ok ? await done({ tool: "text", ...r }) : await fail(`Review request not sent: ${r.status}`);
      }
      case "REVIEW_REPLY": {
        if (!p.reviewId || !p.reply) return await fail("No review or reply text");
        return await done({ tool: "gmb", review: await gmb.reply(s, p.reviewId, p.reply) });
      }
      case "GOOGLE_POST": {
        return await done({ tool: "gmb", post: await gmb.publishPost(s, { postType: p.postType ?? "update", prompt: p.prompt ?? "", ctaUrl: p.ctaUrl }) });
      }
      case "PROMO_REEL": {
        return await done({ tool: "videoStudio", job: await videoStudio.promoReel(s, { name: p.name ?? "Promo", brief: p.brief ?? "", overlay: p.overlay }) });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent({ businessId: business.id, source: "GROWTH", level: "ERROR", message: `Growth action failed: ${action.title}`, meta: { actionId: action.id, error: msg } });
    return await fail(msg);
  }
  return await fail(`Unknown action type ${type}`);
}

/** Runs every APPROVED action for a business (oldest first), up to `limit`. */
export async function executeApproved(businessId: string, now = new Date(), limit = 25) {
  const queue = await prisma.growthAction.findMany({ where: { businessId, status: "APPROVED" }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: limit });
  const results: ExecResult[] = [];
  for (const a of queue) results.push(await executeAction(a.id, now));
  return results;
}
