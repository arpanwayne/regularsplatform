"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Business } from "@prisma/client";

export function SettingsForm({ business }: { business: Business }) {
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
    const res = await fetch("/api/business", {
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

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="font-medium">WhatsApp webhook setup</h2>
        <p className="text-sm text-gray-600">
          Meta App Dashboard → WhatsApp → Configuration mein ye webhook URL aur verify token daalo:
        </p>
        <CopyRow label="Callback URL" value={webhookUrl} />
        <CopyRow label="Verify token" value={business.whatsappVerifyToken} />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="font-medium mb-3">WhatsApp Cloud API credentials</h2>
        <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone number ID</label>
            <input
              name="whatsappPhoneNumberId"
              defaultValue={business.whatsappPhoneNumberId ?? ""}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. 109876543210123"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access token</label>
            <input
              name="whatsappAccessToken"
              type="password"
              defaultValue={business.whatsappAccessToken ?? ""}
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
