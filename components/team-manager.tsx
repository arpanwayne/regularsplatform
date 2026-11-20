"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Manager = { id: string; name: string; email: string; phone: string | null };

export function TeamManager({ managers }: { managers: Manager[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(data.error || "Couldn't add the manager. Please try again."); return; }
    setForm({ name: "", email: "", phone: "", password: "" });
    router.refresh();
  }

  async function remove(m: Manager) {
    if (!window.confirm(`Remove ${m.name}'s login? They won't be able to sign in any more.`)) return;
    const res = await fetch(`/api/team/${m.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else window.alert("Couldn't remove. Please try again.");
  }

  const input = "w-full rounded-input border border-control px-3 py-2 text-sm";
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-card border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Manager</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Mobile (WhatsApp)</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {managers.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No managers yet.</td></tr>
            )}
            {managers.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium">{m.name}</td>
                <td className="px-4 py-3 text-gray-600">{m.email}</td>
                <td className="px-4 py-3 text-gray-600">{m.phone ? `+${m.phone}` : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(m)} className="text-sm font-medium text-red-600 hover:text-red-700">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={add} className="space-y-3 rounded-card border border-gray-200 bg-white p-4">
        <h2 className="font-medium">Add a manager</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={input} placeholder="Email (their login)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className={input} placeholder="Mobile they use on WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          <input className={input} placeholder="Password (8+ characters)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        </div>
        <p className="text-xs text-gray-500">
          From this mobile they can WhatsApp your business number: <span className="font-mono">add Rahul 98xxxxxxxx</span> to add a customer.
          Share the email and password with them yourself.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={saving} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
          {saving ? "Adding…" : "Add manager"}
        </button>
      </form>
    </div>
  );
}
