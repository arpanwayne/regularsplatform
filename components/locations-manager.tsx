"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Location } from "@prisma/client";

type LocationRow = Location & { hasWhatsappToken?: boolean; hasInstagramToken?: boolean };

export function LocationsManager({ locations, sharedNumber, instagram = false }: { locations: LocationRow[]; sharedNumber?: string | null; instagram?: boolean }) {
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
        Each location can connect its own WhatsApp Business number. If you have one outlet, keep one location. Add more here if you have several.
      </p>
      {sharedNumber && (
        <p className="rounded-card bg-green-50 px-3 py-2 text-sm text-green-800">
          Locations without their own number send WhatsApp messages from <b>{sharedNumber}</b> (shared number). Every message names your business, so nothing else needs setting up.
        </p>
      )}

      {locations.map((loc) => (
        <LocationCard key={loc.id} location={loc} canDelete={locations.length > 1} sharedNumber={sharedNumber} instagram={instagram} />
      ))}

      <div className="rounded-card border border-dashed border-gray-300 p-4">
        {adding === false && (
          <form onSubmit={addLocation} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New location name, e.g. Andheri branch"
              className="flex-1 rounded-input border border-control px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              + Add location
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function LocationCard({ location, canDelete, sharedNumber, instagram }: { location: LocationRow; canDelete: boolean; sharedNumber?: string | null; instagram?: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhook/whatsapp` : "/api/webhook/whatsapp";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setWaError(null);
    const form = new FormData(e.currentTarget);
    const phoneId = String(form.get("whatsappPhoneNumberId") ?? "").trim();
    const token = String(form.get("whatsappAccessToken") ?? "").trim();
    if (!phoneId && !token) { setSaving(false); setWaError("Nothing to save. Leave these empty to use the shared number."); return; }
    const res = await fetch(`/api/locations/${location.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // Empty token field = keep the saved one.
      body: JSON.stringify({ ...(phoneId ? { whatsappPhoneNumberId: phoneId } : {}), ...(token ? { whatsappAccessToken: token } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setWaError(typeof data.error === "string" ? data.error : "Couldn't save. Check the Phone number ID and token.");
    }
  }

  async function disconnectWhatsApp() {
    if (!confirm("Stop using this location's own WhatsApp number? Messages will go from the shared number (if your country uses it).")) return;
    setWaError(null);
    const res = await fetch(`/api/locations/${location.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ whatsappDisconnect: true }) });
    if (res.ok) router.refresh(); else setWaError("Couldn't disconnect. Please try again.");
  }

  // Bug 2 (27 Nov 2026): a login email autofilled into "Phone number ID" is not a number.
  const badPhoneId = !!location.whatsappPhoneNumberId && !/^\d{6,25}$/.test(location.whatsappPhoneNumberId);

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
    <section className="rounded-card border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium">{location.name}</h2>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              location.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
            }`}
          >
            {location.status}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleStatus}
            className="rounded-full border border-control px-3 py-1 text-xs font-medium hover:bg-gray-50"
          >
            {location.status === "ACTIVE" ? "Suspend" : "Activate"}
          </button>
          {canDelete && (
            <button
              onClick={deleteLocation}
              className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <p className="text-sm">
        WhatsApp:{" "}
        {badPhoneId
          ? <span className="font-medium text-red-700">wrong value saved in Phone number ID — press Disconnect, then enter the real ID or use the shared number</span>
          : location.whatsappPhoneNumberId && location.hasWhatsappToken
          ? <span className="font-medium text-green-700">own number connected{location.whatsappDisplayNumber ? ` (${location.whatsappDisplayNumber})` : ""}</span>
          : sharedNumber
            ? <span className="font-medium text-green-700">using the shared number {sharedNumber}</span>
            : <span className="font-medium text-amber-700">not connected</span>}
      </p>

      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          Only if you connect your own number — add these in Meta App Dashboard → WhatsApp → Configuration:
        </p>
        <CopyRow label="Callback URL" value={webhookUrl} />
        <CopyRow label="Verify token" value={location.whatsappVerifyToken} />
      </div>

      {/* autoComplete off: browsers filled the owner's login email and password in here (bugs 2 + 10). */}
      <form onSubmit={handleSubmit} className="space-y-3 max-w-md" autoComplete="off">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone number ID</label>
          <input
            name="whatsappPhoneNumberId"
            defaultValue={badPhoneId ? "" : location.whatsappPhoneNumberId ?? ""}
            autoComplete="off"
            pattern="\d{6,25}"
            title="Only digits, from Meta → WhatsApp → API Setup"
            inputMode="numeric"
            data-lpignore="true"
            data-1p-ignore
            className="w-full rounded-input border border-control px-3 py-2 text-sm"
            placeholder="e.g. 109876543210123"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Access token</label>
          {/* Not type="password": a text box above a password box is what Chrome treats as a
              login form, so it filled the owner's email + password here even with autocomplete off
              (retest 27 Nov 2026, bug 10). Masked with CSS instead. */}
          <input
            name="whatsappAccessToken"
            type="text"
            defaultValue=""
            autoComplete="off"
            spellCheck={false}
            style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
            data-lpignore="true"
            data-1p-ignore
            className="w-full rounded-input border border-control px-3 py-2 text-sm"
            placeholder={location.hasWhatsappToken ? "Saved — leave empty to keep it" : "System user permanent access token"}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-brand-600 px-4 py-2 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {location.whatsappPhoneNumberId && (
          <button type="button" onClick={disconnectWhatsApp} className="ml-3 rounded-full border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            Disconnect own number
          </button>
        )}
        {saved && <span className="ml-3 text-sm text-brand-700">Saved — Meta accepted this number</span>}
        {waError && <p className="text-sm text-red-600">{waError}</p>}
      </form>

      {instagram && <InstagramConnect location={location} />}
    </section>
  );
}

/**
 * Instagram DMs → booking (Loopdesk add-on). The owner pastes the
 * professional account ID and an Instagram access token from the Meta App
 * Dashboard; DMs then show up in the inbox and "can I book?" gets the
 * booking link automatically.
 */
function InstagramConnect({ location }: { location: LocationRow }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhook/instagram` : "/api/webhook/instagram";
  const connected = !!location.instagramAccountId && !!location.hasInstagramToken;

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/locations/${location.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      const err = typeof data.error === "string" ? data.error : Object.values(data.error?.fieldErrors ?? {}).flat().join(" ") || "Couldn't save.";
      setMsg({ ok: false, text: err });
      return;
    }
    setMsg(data.instagramWarning ? { ok: false, text: data.instagramWarning } : { ok: true, text: "Saved" });
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const id = String(form.get("instagramAccountId") ?? "").trim();
    const token = String(form.get("instagramAccessToken") ?? "").trim();
    const username = String(form.get("instagramUsername") ?? "").trim();
    save({
      ...(id ? { instagramAccountId: id } : {}),
      ...(token ? { instagramAccessToken: token } : {}), // empty = keep the saved one
      instagramUsername: username || null,
      instagramAutoBooking: form.get("instagramAutoBooking") === "on",
    });
  }

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <p className="text-sm">
        Instagram DMs:{" "}
        {connected
          ? <span className="font-medium text-green-700">connected{location.instagramUsername ? ` (@${location.instagramUsername})` : ""}</span>
          : <span className="font-medium text-amber-700">not connected</span>}
      </p>
      <p className="text-xs text-gray-500">
        DMs to this Instagram account show up in your inbox. When someone asks to book, they get your booking link
        {location.bookingUrl ? "" : " (add a booking link under Front Desk below first)"}. In the Meta App Dashboard →
        Instagram → Webhooks, use:
      </p>
      <CopyRow label="Callback URL" value={webhookUrl} />
      <p className="text-xs text-gray-500">Verify token: the INSTAGRAM_WEBHOOK_VERIFY_TOKEN your admin set. Subscribe to <b>messages</b>.</p>

      <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instagram account ID</label>
          <input name="instagramAccountId" defaultValue={location.instagramAccountId ?? ""}
            className="w-full rounded-input border border-control px-3 py-2 text-sm" placeholder="e.g. 17841400000000000" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instagram username</label>
          <input name="instagramUsername" defaultValue={location.instagramUsername ?? ""}
            className="w-full rounded-input border border-control px-3 py-2 text-sm" placeholder="e.g. mapleh_vac" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instagram access token</label>
          <input name="instagramAccessToken" type="password" defaultValue=""
            className="w-full rounded-input border border-control px-3 py-2 text-sm"
            placeholder={location.hasInstagramToken ? "Saved — leave empty to keep it" : "System user token from Meta (Unified login, instagram_manage_messages)"} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="instagramAutoBooking" defaultChecked={location.instagramAutoBooking} />
          Send my booking link automatically when someone asks to book
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="rounded-full bg-brand-600 px-4 py-2 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60">
            {saving ? "Saving…" : "Save Instagram"}
          </button>
          {connected && (
            <button type="button" disabled={saving} onClick={() => confirm("Disconnect Instagram from this location?") && save({ instagramAccountId: null })}
              className="text-sm text-red-700 underline">Disconnect</button>
          )}
          {msg && <span className={`text-sm ${msg.ok ? "text-brand-700" : "text-red-600"}`}>{msg.text}</span>}
        </div>
      </form>
    </div>
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
