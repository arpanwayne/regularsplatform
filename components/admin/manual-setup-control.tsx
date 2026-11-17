"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LABEL: Record<string, string> = { SETUP: "setting up", READY: "ready", PAUSED: "paused" };

/**
 * Manual software in a custom bundle (Korvo, Loyvexa…): our team sets the
 * client up by hand, then marks it Ready here. The client's home page shows
 * "Setting up" until then, and the link once it's ready.
 */
export function ManualSetupControl({ businessId, productId, status, link }: { businessId: string; productId: string; status: string; link: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function save(next: string) {
    const l = next === "READY" ? prompt("Client's link for this software (leave empty to use the product link):", link ?? "") : null;
    if (next === "READY" && l === null) return; // cancelled
    setBusy(true);
    await fetch(`/api/admin/businesses/${businessId}/bundle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "setup", productId, status: next, ...(next === "READY" ? { link: l?.trim() ? l.trim() : null } : {}) }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <span>
      <span className={status === "READY" ? "text-green-700" : status === "PAUSED" ? "text-gray-500" : "text-amber-700"}>{LABEL[status] ?? status}</span>
      {link && <a href={link} target="_blank" rel="noopener" className="ml-1 text-brand-700 underline">link</a>}
      {status !== "READY" && <button disabled={busy} onClick={() => save("READY")} className="ml-2 text-brand-700 underline">Mark ready</button>}
      {status === "READY" && <button disabled={busy} onClick={() => save("SETUP")} className="ml-2 text-gray-600 underline">Back to setting up</button>}
    </span>
  );
}
