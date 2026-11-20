"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InboxReply({ customerId, disabled, channel = "SMS", windowOpen = true }: {
  customerId: string; disabled?: boolean; channel?: "WHATSAPP" | "SMS" | "INSTAGRAM"; windowOpen?: boolean;
}) {
  const wa = channel === "WHATSAPP";
  const ig = channel === "INSTAGRAM";
  const router = useRouter();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/inbox/${customerId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(
        data.status === "OPTED_OUT" ? "This customer opted out of texts." :
        data.status === "NO_NUMBER" ? "This location has no texting number yet — ask your admin to assign one." :
        String(data.error ?? "").startsWith("INSTAGRAM_NOT_CONNECTED") ? "Instagram isn't connected for this location — add it in Settings." :
        String(data.error ?? "").startsWith("WINDOW_CLOSED") && ig ? "Instagram only allows a reply within 24 hours of the customer's last message." :
        String(data.error ?? "").startsWith("WINDOW_CLOSED") ? "WhatsApp only allows a free reply within 24 hours of the customer's last message. They'll get your next follow-up as an approved template." :
        data.error || "Couldn't send."
      );
      return;
    }
    setText("");
    router.refresh();
  }

  if (disabled) {
    return <p className="border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
      {wa ? "This customer asked to stop WhatsApp messages." : "This customer replied STOP — you can't text them until they reply START."}
    </p>;
  }
  if (ig && !windowOpen) {
    return <p className="border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
      More than 24 hours since this customer&apos;s last Instagram message, so Instagram won&apos;t allow a reply. You can reply again as soon as they DM you.
    </p>;
  }
  if (wa && !windowOpen) {
    return <p className="border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
      More than 24 hours since this customer&apos;s last WhatsApp message, so WhatsApp won&apos;t allow a free reply. You can reply again as soon as they write to you.
    </p>;
  }
  return (
    <form onSubmit={send} className="border-t border-gray-200 p-3">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder={ig ? "Type an Instagram reply…" : wa ? "Type a WhatsApp reply…" : "Type a reply… (your business name and “Reply STOP to opt out” are added automatically)"}
          className="flex-1 rounded-input border border-control px-3 py-2 text-sm"
        />
        <button disabled={sending || !text.trim()} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
