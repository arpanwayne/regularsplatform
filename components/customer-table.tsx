"use client";

import { Fragment, useRef, useState } from "react";
import type { Customer } from "@prisma/client";
import { useRouter } from "next/navigation";
import { SegmentBadge } from "@/components/segment-badge";
import { formatDate } from "@/lib/format";
import { isInstagramOnly } from "@/lib/instagram-shared";

type CustomerWithLocation = Customer & { location?: { name: string } };

export function CustomerTable({
  customers,
  showLocation = false,
  country,
  hideScripts = false,
}: {
  customers: CustomerWithLocation[];
  showLocation?: boolean;
  country?: string | null;
  /** Managers don't generate calling scripts; the owner does. */
  hideScripts?: boolean;
}) {
  const router = useRouter();

  async function removeData(id: string, label: string) {
    if (!window.confirm(`Permanently remove ${label}'s data? This can't be undone.`)) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else window.alert("That couldn't be removed. Please try again.");
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEdit(c: CustomerWithLocation) {
    setEditingId(c.id);
    setEditName(c.name ?? "");
    setEditPhone(isInstagramOnly(c) ? "" : `+${c.phone}`); // Instagram-only: the owner can add a real number
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setEditError(null);
    const res = await fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      // An Instagram-only customer may have no number yet: leave phone out unless one was typed.
      body: JSON.stringify({ name: editName.trim() || null, ...(editPhone.trim() ? { phone: editPhone } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setEditError(data.error || "Couldn't save. Please try again."); return; }
    setEditingId(null);
    router.refresh();
  }

  const [openScriptFor, setOpenScriptFor] = useState<string | null>(null);
  const [scripts, setScripts] = useState<Record<string, { title: string; content: string }>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const generating = useRef(false); // bug 15: a fast double tap fired two requests
  async function generateScript(customerId: string) {
    if (generating.current) return;
    generating.current = true;
    setLoadingId(customerId);
    const res = await fetch("/api/calling-scripts/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId }),
    }).catch(() => null);
    setLoadingId(null);
    generating.current = false;
    if (!res?.ok) return;
    const data = await res.json();
    setScripts((prev) => ({ ...prev, [customerId]: data.script }));
    setOpenScriptFor(customerId);
  }


  // Shared by the table (desktop) and the cards (phone, bug 12 of 27 Nov 2026).
  const badgesFor = (c: CustomerWithLocation) => (
    <>
      <SegmentBadge segment={c.segment} />
      {c.consentStatus === "PENDING" && (
        <span title="Asked to reply YES or NO — no offers until YES" className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Waiting for YES
        </span>
      )}
      {c.consentStatus === "DECLINED" && (
        <span title="Said NO to offers" className="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          No offers
        </span>
      )}
      {c.consentStatus === "GRANTED" && c.consentSource === "QR" && (
        <span title={c.joinTag ? `Joined by QR (${c.joinTag})` : "Joined by QR"} className="ml-1 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
          QR{c.joinTag ? ` · ${c.joinTag}` : ""}
        </span>
      )}
      {c.optedOut && (
        <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          Opted out
        </span>
      )}
    </>
  );
  const nameCell = (c: CustomerWithLocation) => (
    <>
      {editingId === c.id ? (
        <div className="space-y-1">
          <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} placeholder="Name"
            aria-label="Customer name" className="w-44 rounded-input border border-control px-2 py-1 text-sm" />
          <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} maxLength={25} placeholder="+91 98765 43210"
            aria-label="Phone number" inputMode="tel" className="block w-44 rounded-input border border-control px-2 py-1 text-sm" />
          {editError && <p className="max-w-[16rem] text-xs text-red-600">{editError}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => saveEdit(c.id)} className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setEditingId(null)} className="text-xs text-gray-600 underline">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p className="font-medium">{c.name || "Unnamed"}</p>
          <p className="text-gray-500">
            {isInstagramOnly(c) ? <>Instagram{c.instagramUsername ? ` · @${c.instagramUsername}` : ""}</> : `+${c.phone}`}
          </p>
        </>
      )}
    </>
  );
  const actionsFor = (c: CustomerWithLocation) => (
    <>
      <button type="button" onClick={() => startEdit(c)} className="mr-3 text-xs text-brand-700 underline">Edit</button>
      <a href={`/api/customers/${c.id}`} className="mr-3 text-xs text-gray-500 underline">Export</a>
      <button type="button" onClick={() => removeData(c.id, c.name || c.phone)} className="mr-3 text-xs text-red-600 underline">Remove</button>
      {!hideScripts && <button
        onClick={() => generateScript(c.id)}
        disabled={loadingId !== null || c.optedOut}
        title={c.optedOut ? "Customer opted out — cannot generate outreach" : undefined}
        className="rounded-full border border-control px-3 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loadingId === c.id ? "Generating…" : "Generate calling script"}
      </button>}
    </>
  );

  if (customers.length === 0) {
    return (
      <div className="rounded-card border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
        Customers appear here after their first call, text, visit or QR scan. You can also add them above or import a list.
      </div>
    );
  }

  return (
    <>
    {/* Phone: one card per customer (bug 12). */}
    <ul className="space-y-3 md:hidden">
      {customers.map((c) => (
        <li key={c.id} className="space-y-2 rounded-card border border-gray-200 bg-white p-4 text-sm">
          <div>{nameCell(c)}</div>
          <div className="flex flex-wrap items-center gap-1">{badgesFor(c)}</div>
          <p className="text-gray-500">
            {c.visitCount} visits · last seen {formatDate(c.lastSeenAt, country)}{showLocation && c.location ? ` · ${c.location.name}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-y-2">{actionsFor(c)}</div>
          {openScriptFor === c.id && scripts[c.id] && (
            <div className="rounded-input bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-500">{scripts[c.id].title}</p>
              <p className="whitespace-pre-wrap">{scripts[c.id].content}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto rounded-card border border-gray-200 bg-white md:block">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-4 py-2 font-medium">Customer</th>
            {showLocation && <th className="px-4 py-2 font-medium">Location</th>}
            <th className="px-4 py-2 font-medium">Segment</th>
            <th className="px-4 py-2 font-medium">Visits</th>
            <th className="px-4 py-2 font-medium">Last seen</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {customers.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <td className="px-4 py-3">
                  {nameCell(c)}
                </td>
                {showLocation && (
                  <td className="px-4 py-3 text-gray-600">{c.location?.name ?? "—"}</td>
                )}
                <td className="px-4 py-3">
                  {badgesFor(c)}
                </td>
                <td className="px-4 py-3">{c.visitCount}</td>
                <td className="px-4 py-3 text-gray-500">
                  {formatDate(c.lastSeenAt, country)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {actionsFor(c)}
                </td>
              </tr>
              {openScriptFor === c.id && scripts[c.id] && (
                <tr>
                  <td colSpan={showLocation ? 6 : 5} className="bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">{scripts[c.id].title}</p>
                    <p className="text-sm whitespace-pre-wrap">{scripts[c.id].content}</p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
