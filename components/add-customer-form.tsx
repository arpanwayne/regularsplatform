"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Dashboard → Customers: add one customer; they get a YES/NO request before any offer. */
export function AddCustomerForm({ locations }: { locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, phone, locationId }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg({ ok: res.ok, text: res.ok ? d.message : d.error || "Couldn't add. Please try again." });
    if (res.ok) { setName(""); setPhone(""); router.refresh(); }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-card border border-gray-200 bg-white p-4 text-sm">
      <h2 className="font-medium">Add a customer</h2>
      <p className="text-gray-600">Ask them first if they&apos;d like offers on WhatsApp. They get one message to reply YES or NO, and offers start only after YES.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input className="rounded-input border border-control px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded-input border border-control px-3 py-2" placeholder="Mobile" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        {locations.length > 1 && (
          <select className="rounded-input border border-control px-2 py-2" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <button disabled={busy} className="rounded-full bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-800 disabled:opacity-60">{busy ? "Adding…" : "Add"}</button>
      </div>
      {msg && <p className={msg.ok ? "text-gray-700" : "text-red-600"}>{msg.text}</p>}
    </form>
  );
}
