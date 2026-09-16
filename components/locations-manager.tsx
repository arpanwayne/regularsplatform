"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Location } from "@prisma/client";

export function LocationsManager({ locations }: { locations: Location[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    await fetch("/api/locations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setAdding(false);
    setNewName("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">
        Har location ka apna WhatsApp Business number hota hai. Ek hi outlet ho to ek hi
        location rakho — chain ho to yahan se aur locations add karo.
      </p>

      {locations.map((loc) => (
        <LocationCard key={loc.id} location={loc} canDelete={locations.length > 1} />
      ))}

      <div className="rounded-lg border border-dashed border-gray-300 p-4">
        {adding === false && (
          <form onSubmit={addLocation} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New location name, e.g. Andheri branch"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + Add location
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function LocationCard({ location, canDelete }: { location: Location; canDelete: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhook/whatsapp` : "/api/webhook/whatsapp";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/locations/${location.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        whatsappPhoneNumberId: form.get("whatsappPhoneNumberId"),
        whatsappAccessToken: form.get("whatsappAccessToken"),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  async function toggleStatus() {
    await fetch(`/api/locations/${location.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: location.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }),
    });
    router.refresh();
  }

  async function deleteLocation() {
    if (!confirm(`"${location.name}" location delete karein? Iska data bhi delete ho jaayega.`)) return;
    await fetch(`/api/locations/${location.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">{location.name}</h2>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              location.status === "ACTIVE" ? "bg-brand-100 text-brand-700" : "bg-red-100 text-red-700"
            }`}
          >
            {location.status}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleStatus}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50"
          >
            {location.status === "ACTIVE" ? "Suspend" : "Activate"}
          </button>
          {canDelete && (
            <button
              onClick={deleteLocation}
              className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          Meta App Dashboard → WhatsApp → Configuration mein daalo:
        </p>
        <CopyRow label="Callback URL" value={webhookUrl} />
        <CopyRow label="Verify token" value={location.whatsappVerifyToken} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone number ID</label>
          <input
            name="whatsappPhoneNumberId"
            defaultValue={location.whatsappPhoneNumberId ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. 109876543210123"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Access token</label>
          <input
            name="whatsappAccessToken"
            type="password"
            defaultValue={location.whatsappAccessToken ?? ""}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="System user permanent access token"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-600 px-4 py-2 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="ml-3 text-sm text-brand-700">Saved</span>}
      </form>
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <code className="block truncate rounded bg-gray-100 px-2 py-1.5 text-xs">{value}</code>
    </div>
  );
}
