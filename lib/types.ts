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
