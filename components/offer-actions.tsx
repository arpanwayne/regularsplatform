"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OfferActions({ id, status, canDecide, canCancel }: { id: string; status: string; canDecide: boolean; canCancel: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "reject" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancel this offer? It won't be sent.")) return;
    setBusy(true);
    const res = await fetch(`/api/offers/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) window.alert(d.error || "That didn't work. Please try again.");
    router.refresh();
  }

  const btn = "rounded-full px-3 py-1 text-xs font-medium disabled:opacity-60";
  return (
    <div className="flex justify-end gap-2 whitespace-nowrap">
      {status === "PENDING_APPROVAL" && canDecide && (
        <>
          <button disabled={busy} onClick={() => act("approve")} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>Approve</button>
          <button disabled={busy} onClick={() => act("reject")} className={`${btn} border border-control text-gray-700 hover:bg-gray-50`}>Reject</button>
        </>
      )}
      {(status === "PENDING_APPROVAL" || status === "APPROVED") && canCancel && (
        <button disabled={busy} onClick={() => act("cancel")} className={`${btn} text-red-600 hover:text-red-700`}>Cancel</button>
      )}
    </div>
  );
}
