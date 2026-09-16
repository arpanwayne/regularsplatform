// Enum-shaped string unions. The Prisma schema stores these as plain
// Strings (SQLite has no native enum type) — these types are the source of
// truth for valid values, enforced at the API boundary via zod.

export type Sector = "SALON" | "GYM" | "CLINIC" | "RETAIL" | "RESTAURANT";
export const SECTORS: Sector[] = ["SALON", "GYM", "CLINIC", "RETAIL", "RESTAURANT"];

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

export type UsageEventType = "AI_SCRIPT_PERSONALIZATION" | "VOICE_CALL";

export type LogSource = "WEBHOOK" | "CALLING_SCRIPT" | "BILLING" | "AUTH";
export type LogLevel = "INFO" | "WARN" | "ERROR";

export type PaymentStatus = "CREATED" | "PAID" | "FAILED";
