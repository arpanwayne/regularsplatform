"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The name customers see in WhatsApp and SMS messages (bug 9, 27 Nov 2026:
 * the YES/NO message said "Pavnoor Kaur" instead of the business). A sender
 * name saved for a location (Front Desk) still wins for that location.
 */
export function BusinessNameForm({ name, senderNames, linked }: { name: string; senderNames: { location: string; sender: string }[]; linked: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/business", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: value }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMsg({ ok: false, text: typeof data.error === "string" ? data.error : "Couldn't save." }); return; }
    setMsg({ ok: true, text: "Saved." });
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-card border border-gray-200 bg-white p-4">
      <h2 className="font-medium">Business name</h2>
      <p className="text-sm text-gray-600">Customers see this name in every message, e.g. &ldquo;{value || "Your business"} would like to send you offers…&rdquo;.</p>
      <form onSubmit={save} autoComplete="off" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} autoComplete="off" aria-label="Business name"
          className="w-full max-w-md rounded-input border border-control px-3 py-2 text-sm" />
        <button disabled={saving || value.trim().length < 2} className="w-fit rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
      {linked && <p className="text-xs text-gray-500">This business is part of a Loopdesk AI plan, so Loopdesk sets this name when it updates the account. Change it in Loopdesk too.</p>}
      {senderNames.length > 0 && (
        <p className="text-xs text-amber-800">
          {senderNames.map((s) => `${s.location}: messages use the sender name "${s.sender}"`).join(" · ")}. Change or clear it under Front Desk below if that is not your business.
        </p>
      )}
    </section>
  );
}
