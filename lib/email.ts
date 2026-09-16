import { logEvent } from "@/lib/logger";

// Thin seam for an email provider (Resend is the natural pick — free tier,
// simple REST API). Same honesty pattern as lib/calling-provider.ts: without
// EMAIL_PROVIDER_API_KEY configured, this does NOT pretend to send an email.
// It logs the content as a WARN in SystemLog instead, so a super admin can
// retrieve a password-reset link from /admin/logs and relay it manually —
// the same fallback the admin-initiated password reset already relies on.
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;

  if (!apiKey || !fromAddress) {
    await logEvent({
      source: "AUTH",
      level: "WARN",
      message: `Email not sent (no EMAIL_PROVIDER_API_KEY configured): "${params.subject}" to ${params.to}`,
      meta: { to: params.to, subject: params.subject, body: params.text },
    });
    return { sent: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        text: params.text,
      }),
    });
    if (!res.ok) {
      await logEvent({
        source: "AUTH",
        level: "ERROR",
        message: `Resend API returned HTTP ${res.status} sending "${params.subject}" to ${params.to}`,
      });
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    await logEvent({
      source: "AUTH",
      level: "ERROR",
      message: "Resend API request threw an error",
      meta: { error: err instanceof Error ? err.message : String(err) },
    });
    return { sent: false };
  }
}
