"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS, SECTORS } from "@/lib/types";

export type AdminBusinessRow = {
  id: string;
  name: string;
  sector: string;
  status: string;
  plan: string;
  planExpiresAt: string | Date | null;
  instagramAddon: boolean;
  connectedLocations: number;
  atRiskAfterDaysOverride: number | null;
  dormantAfterDaysOverride: number | null;
  establishedVisitCountOverride: number | null;
  owner: { name: string; email: string };
  _count: { customers: number; callLogs: number; locations: number };
};

/** showPlan: Regulars plans (Starter/Growth/Pro). Off on Loopdesk, whose clients are on a bundle instead. */
export function BusinessAdminTable({ businesses, showPlan = true }: { businesses: AdminBusinessRow[]; showPlan?: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>) {
    setSavingId(id);
    await fetch(`/api/admin/businesses/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSavingId(null);
    router.refresh();
  }

  if (businesses.length === 0) {
    return (
      <div className="rounded-card border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
        Abhi is portal pe koi business nahi hai.
      </div>
    );
  }

  return (
    <div className="rounded-card border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-4 py-2 font-medium">Business</th>
            <th className="px-4 py-2 font-medium">Owner</th>
            <th className="px-4 py-2 font-medium">WhatsApp</th>
            <th className="px-4 py-2 font-medium">Customers</th>
            <th className="px-4 py-2 font-medium">{showPlan ? "Plan" : "Add-ons"}</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {businesses.map((b) => (
            <Fragment key={b.id}>
              <tr>
                <td className="px-4 py-3">
                  <p className="font-medium">{b.name}</p>
                  <select
                    value={b.sector}
                    disabled={savingId === b.id}
                    onChange={(e) => patch(b.id, { sector: e.target.value })}
                    className="mt-1 rounded-input border border-gray-200 px-1 py-0.5 text-xs text-gray-600"
                    aria-label="Business type"
                    title="Business type — the Google profile tool writes posts for this type"
                  >
                    {SECTORS.map((sct) => <option key={sct} value={sct}>{sct.replace("_", " ").toLowerCase()}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <p>{b.owner.name}</p>
                  <p className="text-gray-500">{b.owner.email}</p>
                </td>
                <td className="px-4 py-3">
                  {b.connectedLocations > 0 ? (
                    <span className="text-brand-700 font-medium">
                      {b.connectedLocations}/{b._count.locations} connected
                    </span>
                  ) : (
                    <span className="text-gray-500">0/{b._count.locations} connected</span>
                  )}
                </td>
                <td className="px-4 py-3">{b._count.customers}</td>
                <td className="px-4 py-3">
                  {showPlan && <>
                  <select
                    value={b.plan}
                    disabled={savingId === b.id}
                    onChange={(e) => patch(b.id, { plan: e.target.value })}
                    className="rounded-input border border-control px-2 py-1 text-xs"
                  >
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  {b.planExpiresAt && (
                    <p className="mt-1 text-xs text-gray-500">
                      till {new Date(b.planExpiresAt).toLocaleDateString("en-IN")}
                    </p>
                  )}
                  </>}
                  <label className="mt-1 flex items-center gap-1 text-xs text-gray-600" title="Instagram DMs → booking add-on">
                    <input type="checkbox" checked={b.instagramAddon} disabled={savingId === b.id}
                      onChange={(e) => patch(b.id, { instagramAddon: e.target.checked })} />
                    Instagram DMs
                  </label>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      b.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() =>
                      patch(b.id, { status: b.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })
                    }
                    disabled={savingId === b.id}
                    className="rounded-full border border-control px-3 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
                  >
                    {b.status === "ACTIVE" ? "Suspend" : "Activate"}
                  </button>
                  <button
                    onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                    className="rounded-full border border-control px-3 py-1 text-xs font-medium hover:bg-gray-50"
                  >
                    {expanded === b.id ? "Close" : "Segmentation"}
                  </button>
                </td>
              </tr>
              {expanded === b.id && (
                <tr>
                  <td colSpan={7} className="bg-gray-50 px-4 py-4">
                    <ThresholdForm business={b} onSave={(body) => patch(b.id, body)} saving={savingId === b.id} />
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

function ThresholdForm({
  business,
  onSave,
  saving,
}: {
  business: AdminBusinessRow;
  onSave: (body: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [atRisk, setAtRisk] = useState(business.atRiskAfterDaysOverride?.toString() ?? "");
  const [dormant, setDormant] = useState(business.dormantAfterDaysOverride?.toString() ?? "");
  const [established, setEstablished] = useState(
    business.establishedVisitCountOverride?.toString() ?? ""
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      atRiskAfterDaysOverride: atRisk ? Number(atRisk) : null,
      dormantAfterDaysOverride: dormant ? Number(dormant) : null,
      establishedVisitCountOverride: established ? Number(established) : null,
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-4">
      <p className="w-full text-xs text-gray-500">
        Platform default: at-risk after 30 days, dormant after 60 days, 3+ visits to count as
        established. Blank = use default.
      </p>
      <Field label="At-risk after (days)" value={atRisk} onChange={setAtRisk} />
      <Field label="Dormant after (days)" value={dormant} onChange={setDormant} />
      <Field label="Established visit count" value={established} onChange={setEstablished} />
      <button
        type="submit"
        disabled={saving}
        className="rounded-full bg-brand-600 px-4 py-1.5 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save overrides"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="default"
        className="w-32 rounded-input border border-control px-2 py-1 text-sm"
      />
    </div>
  );
}
