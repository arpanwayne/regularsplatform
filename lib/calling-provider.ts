// Thin seam for a real voice-calling / AI-telephony provider (e.g. Bland AI,
// Vapi, Exotel, Knowlarity). Not wired to a specific vendor since the PDF
// doesn't name one and it needs a paid account either way — this MVP logs
// the call as PENDING (or TRIGGERED, if a provider is configured) instead
// of pretending to dial out.
export async function triggerVoiceCall(params: {
  toPhone: string;
  script: string;
}): Promise<{ triggered: boolean; providerRef?: string }> {
  const apiKey = process.env.CALLING_PROVIDER_API_KEY;
  const baseUrl = process.env.CALLING_PROVIDER_BASE_URL;

  if (!apiKey || !baseUrl) {
    return { triggered: false };
  }

  // Example shape only — replace with the chosen provider's actual API once
  // one is selected (see README roadmap).
  const res = await fetch(`${baseUrl}/calls`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ to: params.toPhone, script: params.script }),
  });

  if (!res.ok) {
    return { triggered: false };
  }

  const data = await res.json().catch(() => ({}));
  return { triggered: true, providerRef: data?.id };
}
