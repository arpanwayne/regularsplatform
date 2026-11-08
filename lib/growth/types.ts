// AI Growth Manager — shared vocabulary.

export const EVENT_TYPES = [
  "CALL_ANSWERED", "CALL_MISSED", "CALL_SHORT", "CALLBACK_ANSWERED", "CALLBACK_UNANSWERED",
  "BOOKING", "QUOTE_SENT", "QUOTE_ACCEPTED", "QUOTE_DECLINED", "JOB_DONE", "INVOICE_PAID",
  "VISIT", "REVIEW_RECEIVED", "MESSAGE_IN",
] as const;
export type GrowthEventType = (typeof EVENT_TYPES)[number];

/** Events that count as the customer "converting" — they credit the last action that touched them. */
export const CONVERSION_EVENTS: GrowthEventType[] = ["BOOKING", "QUOTE_ACCEPTED", "JOB_DONE", "INVOICE_PAID", "VISIT"];
/** Events that mean the customer was reached and is being handled — stop chasing them. */
export const HANDLED_EVENTS: GrowthEventType[] = ["CALL_ANSWERED", "CALLBACK_ANSWERED", "BOOKING", "QUOTE_ACCEPTED", "QUOTE_DECLINED", "MESSAGE_IN"];
/** Events that also count as a real visit for segmentation (create a Visit row). */
export const VISIT_EVENTS: GrowthEventType[] = ["VISIT", "JOB_DONE"];

export const ACTION_TYPES = [
  "MISSED_LEAD_CALLBACK",   // someone called, didn't get help, hasn't been back in touch
  "QUOTE_FOLLOW_UP",        // a quote has gone quiet
  "SERVICE_DUE",            // last job/visit was one service interval ago
  "WIN_BACK",               // at-risk / dormant customer
  "REVIEW_REQUEST",         // job/visit just happened
  "REVIEW_REPLY",           // a Google review has no reply
  "GOOGLE_POST",            // keep the Google profile fresh (offer on slow weeks)
  "PROMO_REEL",             // short promo video on slow weeks
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type Autonomy = "SUGGEST" | "APPROVE" | "AUTO";
export const AUTONOMY_LEVELS: Autonomy[] = ["SUGGEST", "APPROVE", "AUTO"];

/** Safe defaults: the brain asks before anything a customer sees, except review requests right after a visit. */
export const DEFAULT_AUTONOMY: Record<ActionType, Autonomy> = {
  MISSED_LEAD_CALLBACK: "APPROVE",
  QUOTE_FOLLOW_UP: "APPROVE",
  SERVICE_DUE: "APPROVE",
  WIN_BACK: "APPROVE",
  REVIEW_REQUEST: "AUTO",
  REVIEW_REPLY: "APPROVE",
  GOOGLE_POST: "APPROVE",
  PROMO_REEL: "SUGGEST",
};

/** Short labels for the owner brief and dashboard. */
export const ACTION_LABEL: Record<ActionType, { one: string; many: (n: number) => string }> = {
  MISSED_LEAD_CALLBACK: { one: "Call back a missed lead", many: (n) => `Call back ${n} missed leads` },
  QUOTE_FOLLOW_UP: { one: "Follow up a quote", many: (n) => `Follow up ${n} quotes` },
  SERVICE_DUE: { one: "Remind a customer their service is due", many: (n) => `Remind ${n} customers their service is due` },
  WIN_BACK: { one: "Win back a quiet customer", many: (n) => `Win back ${n} quiet customers` },
  REVIEW_REQUEST: { one: "Ask for a Google review", many: (n) => `Ask ${n} customers for a Google review` },
  REVIEW_REPLY: { one: "Reply to a Google review", many: (n) => `Reply to ${n} Google reviews` },
  GOOGLE_POST: { one: "Publish this week's Google post", many: (n) => `Publish ${n} Google posts` },
  PROMO_REEL: { one: "Make a promo Reel", many: (n) => `Make ${n} promo Reels` },
};

/** Actions that contact a customer directly — subject to quiet hours, touch limits and opt-outs. */
export const CUSTOMER_CONTACT: ActionType[] = ["MISSED_LEAD_CALLBACK", "QUOTE_FOLLOW_UP", "SERVICE_DUE", "WIN_BACK", "REVIEW_REQUEST"];

export type GrowthGoal = "MORE_BOOKINGS" | "MORE_REPEAT_VISITS" | "MORE_REVIEWS";
export const GOALS: GrowthGoal[] = ["MORE_BOOKINGS", "MORE_REPEAT_VISITS", "MORE_REVIEWS"];

/** How much each goal weights each action type when ranking (1 = neutral). */
export const GOAL_WEIGHT: Record<GrowthGoal, Partial<Record<ActionType, number>>> = {
  MORE_BOOKINGS: { MISSED_LEAD_CALLBACK: 1.5, QUOTE_FOLLOW_UP: 1.4, SERVICE_DUE: 1.1 },
  MORE_REPEAT_VISITS: { WIN_BACK: 1.5, SERVICE_DUE: 1.4 },
  MORE_REVIEWS: { REVIEW_REQUEST: 2, REVIEW_REPLY: 1.5 },
};

/** Base chance an action of this type leads to a conversion — refined by the business's own results (learn step). */
export const BASE_WIN_RATE: Record<ActionType, number> = {
  MISSED_LEAD_CALLBACK: 0.3,
  QUOTE_FOLLOW_UP: 0.2,
  SERVICE_DUE: 0.15,
  WIN_BACK: 0.08,
  REVIEW_REQUEST: 0.05,
  REVIEW_REPLY: 0.02,
  GOOGLE_POST: 0.03,
  PROMO_REEL: 0.03,
};

export const ATTRIBUTION_WINDOW_DAYS = 14;
