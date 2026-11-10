// Enum-shaped string unions. The Prisma schema stores these as plain
// Strings (SQLite has no native enum type) — these types are the source of
// truth for valid values, enforced at the API boundary via zod.

export type Sector = "SALON" | "GYM" | "CLINIC" | "RETAIL" | "RESTAURANT" | "HOME_SERVICES" | "OTHER";
export const SECTORS: Sector[] = ["SALON", "GYM", "CLINIC", "RETAIL", "RESTAURANT", "HOME_SERVICES", "OTHER"];

export type Segment = "NEW" | "REGULAR" | "AT_RISK" | "HIGH_SPENDER" | "DORMANT";
export const SEGMENTS: Segment[] = ["NEW", "REGULAR", "AT_RISK", "HIGH_SPENDER", "DORMANT"];

export type MessageDirection = "INBOUND" | "OUTBOUND";

export type MessageType =
  | "BOOKING_CONFIRMATION"
  | "ORDER_UPDATE"
  | "APPOINTMENT_REMINDER"
  | "OTHER";

export type CallLogStatus = "PENDING" | "TRIGGERED" | "COMPLETED" | "FAILED";

export type Role = "OWNER" | "SUPER_ADMIN";

export type BusinessStatus = "ACTIVE" | "SUSPENDED";

// Set automatically on a verified Razorpay payment (see lib/billing.ts), or
// manually by a super admin. See PRICING.md for what each tier includes.
export type Plan = "STARTER" | "GROWTH" | "PRO";
export const PLANS: Plan[] = ["STARTER", "GROWTH", "PRO"];
export const PLAN_PRICE_INR: Record<Plan, number> = {
  STARTER: 999,
  GROWTH: 2499,
  PRO: 5999,
};

export type UsageEventType = "AI_SCRIPT_PERSONALIZATION" | "VOICE_CALL" | "SMS_SENT";

export type Channel = "WHATSAPP" | "SMS";
export const CHANNELS: Channel[] = ["WHATSAPP", "SMS"];
export type MessagePurpose = "MISSED_CALL" | "REVIEW_REQUEST" | "WINBACK" | "FOLLOW_UP" | "REPLY" | "OTHER";
export type FrontDeskPlan = "ANSWER" | "ANSWER_RETURN" | "GROW";
export const FRONT_DESK_PLANS: FrontDeskPlan[] = ["ANSWER", "ANSWER_RETURN", "GROW"];
/** Included outgoing SMS per month for each Front Desk plan (from the product doc). */
export const FRONT_DESK_SMS_LIMIT: Record<FrontDeskPlan, number | null> = {
  ANSWER: 0, // owner summaries only — sent by WayneRing, not Regulars
  ANSWER_RETURN: 500,
  GROW: 1000,
};

export type LogSource = "PRIVACY" | "WEBHOOK" | "CALLING_SCRIPT" | "BILLING" | "AUTH" | "API" | "SMS" | "GROWTH";
export type LogLevel = "INFO" | "WARN" | "ERROR";

export type PaymentStatus = "CREATED" | "PAID" | "FAILED";
