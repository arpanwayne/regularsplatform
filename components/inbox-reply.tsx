"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InboxReply({ customerId, disabled }: { customerId: string; disabled?: boolean }) {
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
        data.error || "Couldn't send."
      );
      return;
    }
    setText("");
    router.refresh();
  }

  if (disabled) {
    return <p className="border-t border-gray-200 px-5 py-3 text-sm text-gray-500">This customer replied STOP — you can&apos;t text them until they reply START.</p>;
  }
  return (
    <form onSubmit={send} className="border-t border-gray-200 p-3">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Type a reply… (your business name and “Reply STOP to opt out” are added automatically)"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button disabled={sending || !text.trim()} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
