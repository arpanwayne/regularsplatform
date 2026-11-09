"use client";

import { Fragment, useState } from "react";
import type { Customer } from "@prisma/client";
import { useRouter } from "next/navigation";
import { SegmentBadge } from "@/components/segment-badge";
import { formatDate } from "@/lib/format";

type CustomerWithLocation = Customer & { location?: { name: string } };

export function CustomerTable({
  customers,
  showLocation = false,
  country,
  bundle = false,
}: {
  customers: CustomerWithLocation[];
  showLocation?: boolean;
  country?: string | null;
  /** Bundle owners get AI follow-ups from Growth AI, so no manual scripts. */
  bundle?: boolean;
}) {
  const router = useRouter();

  async function removeData(id: string, label: string) {
    if (!window.confirm(`Permanently remove ${label}'s data? This can't be undone.`)) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else window.alert("That couldn't be removed. Please try again.");
  }

  const [openScriptFor, setOpenScriptFor] = useState<string | null>(null);
  const [scripts, setScripts] = useState<Record<string, { title: string; content: string }>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function generateScript(customerId: string) {
    setLoadingId(customerId);
    const res = await fetch("/api/calling-scripts/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId }),
    });
    setLoadingId(null);
    if (!res.ok) return;
    const data = await res.json();
    setScripts((prev) => ({ ...prev, [customerId]: data.script }));
    setOpenScriptFor(customerId);
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
        Customers appear here after their first call, text or visit. You can also import a list in Settings.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
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
                  <p className="font-medium">{c.name || "Unnamed"}</p>
                  <p className="text-gray-500">{c.phone}</p>
                </td>
                {showLocation && (
                  <td className="px-4 py-3 text-gray-600">{c.location?.name ?? "—"}</td>
                )}
                <td className="px-4 py-3">
                  <SegmentBadge segment={c.segment} />
                  {c.optedOut && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Opted out
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{c.visitCount}</td>
                <td className="px-4 py-3 text-gray-500">
                  {formatDate(c.lastSeenAt, country)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <a href={`/api/customers/${c.id}`} className="mr-3 text-xs text-gray-500 underline">Export</a>
                  <button type="button" onClick={() => removeData(c.id, c.name || c.phone)} className="mr-3 text-xs text-red-600 underline">Remove</button>
                  {!bundle && <button
                    onClick={() => generateScript(c.id)}
                    disabled={loadingId === c.id || c.optedOut}
                    title={c.optedOut ? "Customer opted out — cannot generate outreach" : undefined}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loadingId === c.id ? "Generating…" : "Generate calling script"}
                  </button>}
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
  );
}
