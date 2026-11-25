"use client";

import { useEffect, useState } from "react";

/**
 * Landing page for one login from Loopdesk AI. Loopdesk sends the owner to
 * /sso#token=…&next=… (a fragment, so the token never reaches server logs);
 * we swap it for a Regulars session and go to the page they asked for.
 */
export default function SsoPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    // Drop the token from the address bar and history straight away.
    window.history.replaceState(null, "", "/sso");
    if (!token) {
      setError("This sign-in link is incomplete. Open Regulars again from Loopdesk AI.");
      return;
    }
    fetch("/api/hub/sso/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Sign-in failed");
        window.location.assign(data.next ?? "/dashboard");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Sign-in failed"));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="max-w-sm rounded-card border border-gray-200 bg-white p-6 text-center">
        {error ? (
          <>
            <h1 className="mb-2 font-medium">Couldn&apos;t sign you in</h1>
            <p className="text-sm text-gray-600">{error}</p>
            <p className="mt-4 text-sm text-gray-600">Go back to Loopdesk AI and open Regulars again.</p>
          </>
        ) : (
          <p className="text-sm text-gray-600">Signing you in from Loopdesk AI…</p>
        )}
      </div>
    </main>
  );
}
