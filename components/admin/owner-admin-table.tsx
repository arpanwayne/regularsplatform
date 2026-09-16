"use client";

import { useState } from "react";

export type AdminOwnerRow = {
  id: string;
  name: string;
  email: string;
  businesses: { id: string; name: string; sector: string; status: string }[];
};

export function OwnerAdminTable({ owners }: { owners: AdminOwnerRow[] }) {
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});

  async function resetPassword(id: string) {
    if (
      !confirm(
        "Yeh owner ka current password turant invalid kar dega aur ek naya temporary password banayega. Continue?"
      )
    ) {
      return;
    }
    setResettingId(id);
    const res = await fetch(`/api/admin/owners/${id}/reset-password`, { method: "POST" });
    setResettingId(null);
    if (!res.ok) return;
    const data = await res.json();
    setTempPasswords((prev) => ({ ...prev, [id]: data.tempPassword }));
  }

  if (owners.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
        Abhi tak koi business owner signup nahi hua.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-4 py-2 font-medium">Owner</th>
            <th className="px-4 py-2 font-medium">Businesses</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {owners.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3">
                <p className="font-medium">{o.name}</p>
                <p className="text-gray-500">{o.email}</p>
              </td>
              <td className="px-4 py-3 text-gray-600">
                {o.businesses.map((b) => b.name).join(", ") || "—"}
              </td>
              <td className="px-4 py-3 text-right">
                {tempPasswords[o.id] ? (
                  <div className="text-xs">
                    <p className="text-gray-500">Naya temporary password (ek hi baar dikhega):</p>
                    <code className="rounded bg-gray-100 px-2 py-1">{tempPasswords[o.id]}</code>
                  </div>
                ) : (
                  <button
                    onClick={() => resetPassword(o.id)}
                    disabled={resettingId === o.id}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-60"
                  >
                    {resettingId === o.id ? "Resetting…" : "Reset password"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
