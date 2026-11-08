"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Business, Location } from "@prisma/client";

/**
 * Settings → Texting & Front Desk: business channel defaults, per-location
 * SMS details (sender name, booking + review links, owner forward number),
 * customer CSV import and the win-back button.
 */
export function FrontDeskSettings({ business, locations }: { business: Business; locations: Location[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function patchBusiness(data: Record<string, unknown>) {
    const res = await fetch("/api/business", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    setMsg(res.ok ? "Saved." : "Couldn't save.");
    router.refresh();
  }

  return (
    <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold">Texting &amp; Front Desk</h2>
        <p className="text-sm text-gray-600">
          SMS for missed-call text-backs, review requests, win-backs and the two-way inbox.
          {business.frontDeskPlan && <> Plan: <b>{business.frontDeskPlan.replace("_", " + ")}</b>.</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Default channel
          <select defaultValue={business.defaultChannel} onChange={(e) => patchBusiness({ defaultChannel: e.target.value })}
            className="rounded-md border border-gray-300 px-2 py-1">
            <option value="SMS">SMS (Canada)</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Country
          <select defaultValue={business.country} onChange={(e) => patchBusiness({ country: e.target.value })}
            className="rounded-md border border-gray-300 px-2 py-1">
            <option value="CA">Canada</option>
            <option value="US">United States</option>
            <option value="IN">India</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" defaultChecked={business.autoReviewRequest} onChange={(e) => patchBusiness({ autoReviewRequest: e.target.checked })} />
          Ask for a Google review after every visit
        </label>
        {msg && <span className="text-gray-500">{msg}</span>}
      </div>

      {locations.map((l) => <LocationSms key={l.id} location={l} />)}

      <CsvImport locations={locations} />
      <Winback />
    </section>
  );
}

function LocationSms({ location }: { location: Location }) {
  const router = useRouter();
  const [form, setForm] = useState({
    smsSenderName: location.smsSenderName ?? "",
    bookingUrl: location.bookingUrl ?? "",
    googleReviewUrl: location.googleReviewUrl ?? "",
    ownerNotifyPhone: location.ownerNotifyPhone ?? "",
  });
  const [status, setStatus] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    const res = await fetch(`/api/locations/${location.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? "Saved." : `Check the fields: ${JSON.stringify(data.error?.fieldErrors ?? data.error)}`);
    router.refresh();
  }

  const field = (k: keyof typeof form, label: string, placeholder: string) => (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-3 rounded-md border border-gray-100 bg-gray-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{location.name}</h3>
        <span className="text-sm text-gray-600">
          Texting number: {location.smsFromNumber ? <b>{location.smsFromNumber}</b> : <span className="text-amber-700">not assigned yet (your admin sets this up)</span>}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {field("smsSenderName", "Sender name (starts every text)", "Maple HVAC")}
        {field("ownerNotifyPhone", "Forward customer replies to", "+14165550123")}
        {field("bookingUrl", "Booking link", "https://cal.com/maple-hvac")}
        {field("googleReviewUrl", "Google review link", "https://g.page/r/…/review")}
      </div>
      <div className="flex items-center gap-3">
        <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Save</button>
        {status && <span className="text-sm text-gray-500">{status}</span>}
      </div>
    </form>
  );
}

function CsvImport({ locations }: { locations: Location[] }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true); setResult(null);
    const res = await fetch(`/api/customers/import?locationId=${locationId}`, { method: "POST", headers: { "content-type": "text/csv" }, body: await file.text() });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setResult(res.ok ? `Imported ${d.rows} rows: ${d.created} new, ${d.updated} updated, ${d.skipped} skipped.${d.errors?.length ? " " + d.errors.slice(0, 3).join("; ") : ""}` : d.error || "Import failed.");
    router.refresh();
  }

  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-medium">Import customer list (CSV)</h3>
      <p className="text-gray-600">Columns: <code>phone</code> (required), <code>name</code>, <code>last_visit</code>, <code>visits</code>, <code>total_spend</code>, <code>channel</code>. Only import people who&apos;ve been your customers.</p>
      <div className="flex flex-wrap items-center gap-2">
        {locations.length > 1 && (
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1">
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        {busy && <span className="text-gray-500">Importing…</span>}
      </div>
      {result && <p className="text-gray-700">{result}</p>}
    </div>
  );
}

function Winback() {
  const [preview, setPreview] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    const res = await fetch("/api/front-desk/winback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dryRun }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (dryRun) setPreview(d.eligible ?? 0);
    else { setResult(`Sent ${d.sent}, not sent ${d.failed}.`); setPreview(null); }
  }

  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-medium">Win back quiet customers</h3>
      <p className="text-gray-600">Texts at-risk and dormant customers who haven&apos;t had a win-back in 30 days. Runs daily for Answer + Return and Grow plans.</p>
      <div className="flex items-center gap-2">
        {preview === null ? (
          <button disabled={busy} onClick={() => run(true)} className="rounded-md border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-50">Preview</button>
        ) : (
          <>
            <span>{preview} customer{preview === 1 ? "" : "s"} would get a text.</span>
            {preview > 0 && <button disabled={busy} onClick={() => run(false)} className="rounded-md bg-brand-600 px-3 py-1.5 font-medium text-white hover:bg-brand-700">Send now</button>}
          </>
        )}
        {result && <span className="text-gray-700">{result}</span>}
      </div>
    </div>
  );
}
