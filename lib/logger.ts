import { prisma } from "@/lib/prisma";
import type { LogLevel, LogSource } from "@/lib/types";

/**
 * Writes one row to SystemLog, visible to a super admin at /admin/logs.
 * This is the "proper error/log viewer" support: webhook parse failures,
 * calling-script/voice-call errors, and billing failures all funnel through
 * here instead of disappearing into server stdout only a deploy platform's
 * own logs would show.
 *
 * ERROR-level events are also forwarded to ALERT_WEBHOOK_URL when set (a
 * Slack incoming webhook or any endpoint that accepts JSON) — /admin/logs
 * only surfaces problems to someone who goes looking; this is the "get
 * paged" half of observability that a dedicated APM (Sentry, Datadog)
 * would otherwise provide. Deliberately not a full APM integration: no
 * traces, no performance monitoring, just error alerting. Both this and
 * the DB write swallow their own errors — logging must never be the
 * reason a request fails.
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

  if (params.level === "ERROR") {
    await sendAlert(params);
  }
}

async function sendAlert(params: {
  businessId?: string;
  source: LogSource;
  message: string;
  meta?: Record<string, unknown>;
}) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // "text" makes this work as-is against a Slack incoming webhook;
        // the rest is there for any other JSON-accepting endpoint.
        text: `[Regulars] ${params.source} ERROR: ${params.message}`,
        source: params.source,
        level: "ERROR",
        businessId: params.businessId,
        meta: params.meta,
      }),
    });
  } catch {
    // Best-effort — an alerting failure must not cascade into the request
    // that triggered it.
  }
}
