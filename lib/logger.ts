import { prisma } from "@/lib/prisma";
import type { LogLevel, LogSource } from "@/lib/types";

/**
 * Writes one row to SystemLog, visible to a super admin at /admin/logs.
 * This is the "proper error/log viewer" support: webhook parse failures,
 * calling-script/voice-call errors, and billing failures all funnel through
 * here instead of disappearing into server stdout only a deploy platform's
 * own logs would show.
 *
 * Deliberately swallows its own errors — logging must never be the reason a
 * request fails.
 */
export async function logEvent(params: {
  businessId?: string;
  source: LogSource;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.systemLog.create({
      data: {
        businessId: params.businessId,
        source: params.source,
        level: params.level,
        message: params.message,
        meta: params.meta ? JSON.stringify(params.meta) : undefined,
      },
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}
