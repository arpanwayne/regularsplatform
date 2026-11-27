/**
 * Asks Meta whether a Phone number ID + access token really work together
 * (Settings → own WhatsApp number). Bug 17, 27 Nov 2026: a wrong token used
 * to show "own number connected" and every message then failed (Meta 190).
 */
export type VerifyResult = { ok: true; displayNumber: string | null } | { ok: false; error: string };

export async function verifyWhatsAppNumber(phoneNumberId: string, accessToken: string, fetchImpl: typeof fetch = fetch): Promise<VerifyResult> {
  const graph = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v21.0"}`;
  try {
    const res = await fetchImpl(`${graph}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as { display_phone_number?: string; error?: { message?: string; code?: number } };
    if (!res.ok || data.error) {
      const code = data.error?.code;
      const why = code === 190 ? "the access token is wrong or expired" : code === 100 ? "the Phone number ID is wrong, or this token can't see it" : data.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: `${why}${code != null ? ` (Meta ${code})` : ""}` };
    }
    return { ok: true, displayNumber: data.display_phone_number ?? null };
  } catch (err) {
    return { ok: false, error: `couldn't reach Meta (${err instanceof Error ? err.message : String(err)})` };
  }
}
