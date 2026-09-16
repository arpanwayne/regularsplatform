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

// Manually assigned by a super admin (see PRICING.md) — no payment gateway
// is wired in yet, so this does not enforce feature/usage limits by itself.
export type Plan = "STARTER" | "GROWTH" | "PRO";
export const PLANS: Plan[] = ["STARTER", "GROWTH", "PRO"];
