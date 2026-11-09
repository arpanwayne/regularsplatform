"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACTION_LABEL, ACTION_TYPES, type ActionType, type Autonomy } from "@/lib/growth/types";

type S = {
  enabled: boolean; goal: string; timezone: string; currency: string; avgJobValue: number; messageLanguage: string;
  briefHour: number; contactFromHour: number; contactToHour: number; maxTouchesPerWeek: number; dailyActionCap: number;
  serviceIntervalDays: number | null; quoteFollowupDays: number; callQuoteAbove: number; ownerPhone: string | null;
  wayneRingBaseUrl: string | null; wayneRingCallbackKeySet: boolean; gmbLocationId: string | null; videoStudioClientId: string | null;
};

const LEVEL_TEXT: Record<Autonomy, string> = { SUGGEST: "Suggest only", APPROVE: "Ask me first", AUTO: "Do it, then tell me" };

export function GrowthSettingsForm({ settings, autonomy, tools, managed = false }: { settings: S; autonomy: Record<ActionType, Autonomy>; tools: { wayneRing: boolean; gmb: boolean; videoStudio: boolean }; managed?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ ...settings, wayneRingCallbackKey: "" });
  const [levels, setLevels] = useState(autonomy);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const num = (v: string) => (v === "" ? null : Number(v));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      enabled: f.enabled, goal: f.goal, timezone: f.timezone, currency: f.currency, avgJobValue: Number(f.avgJobValue),
      messageLanguage: f.messageLanguage, briefHour: Number(f.briefHour), contactFromHour: Number(f.contactFromHour), contactToHour: Number(f.contactToHour),
      maxTouchesPerWeek: Number(f.maxTouchesPerWeek), dailyActionCap: Number(f.dailyActionCap), serviceIntervalDays: f.serviceIntervalDays,
      quoteFollowupDays: Number(f.quoteFollowupDays), callQuoteAbove: Number(f.callQuoteAbove), autonomy: levels,
      ownerPhone: f.ownerPhone?.trim() || null, wayneRingBaseUrl: f.wayneRingBaseUrl?.trim() || null,
      gmbLocationId: f.gmbLocationId?.trim() || null, videoStudioClientId: f.videoStudioClientId?.trim() || null,
    };
    if (f.wayneRingCallbackKey.trim()) body.wayneRingCallbackKey = f.wayneRingCallbackKey.trim();
    const res = await fetch("/api/growth/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved." : `Check the fields: ${JSON.stringify(d.error?.fieldErrors ?? d.error?.formErrors ?? d.error)}`);
    router.refresh();
  }

  const field = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
  return (
    <form onSubmit={save} className="space-y-6 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Settings</h2>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Growth Manager on
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm"><span className="text-gray-600">Main goal</span>
          <select className={field} value={f.goal} onChange={(e) => set("goal", e.target.value)}>
            <option value="MORE_BOOKINGS">More bookings</option><option value="MORE_REPEAT_VISITS">More repeat visits</option><option value="MORE_REVIEWS">More Google reviews</option>
          </select></label>
        <label className="text-sm"><span className="text-gray-600">Typical job value ({f.currency})</span>
          <input className={field} type="number" min={1} value={f.avgJobValue} onChange={(e) => set("avgJobValue", Number(e.target.value))} /></label>
        <label className="text-sm"><span className="text-gray-600">Language for customer texts</span>
          <select className={field} value={f.messageLanguage} onChange={(e) => set("messageLanguage", e.target.value)}>
            <option value="en">English</option><option value="hinglish">Hinglish</option><option value="hi">Hindi</option><option value="pa">Punjabi</option>
          </select></label>
        <label className="text-sm"><span className="text-gray-600">Service due after (days, blank = off)</span>
          <input className={field} type="number" min={7} value={f.serviceIntervalDays ?? ""} onChange={(e) => set("serviceIntervalDays", num(e.target.value))} placeholder="e.g. 180" /></label>
        <label className="text-sm"><span className="text-gray-600">Follow up quotes after (days)</span>
          <input className={field} type="number" min={1} value={f.quoteFollowupDays} onChange={(e) => set("quoteFollowupDays", Number(e.target.value))} /></label>
        <label className="text-sm"><span className="text-gray-600">Call (not text) quotes worth at least</span>
          <input className={field} type="number" min={0} value={f.callQuoteAbove} onChange={(e) => set("callQuoteAbove", Number(e.target.value))} /></label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How much it does on its own</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {ACTION_TYPES.map((t) => (
            <label key={t} className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
              <span>{ACTION_LABEL[t].one}</span>
              <select value={levels[t]} onChange={(e) => setLevels({ ...levels, [t]: e.target.value as Autonomy })} className="rounded-md border border-gray-300 px-2 py-1">
                {(["SUGGEST", "APPROVE", "AUTO"] as Autonomy[]).map((l) => <option key={l} value={l}>{LEVEL_TEXT[l]}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">Start with &ldquo;Ask me first&rdquo;. After a few weeks of good results, switch the ones you always approve to &ldquo;Do it, then tell me&rdquo;.</p>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-3">
        <legend className="mb-2 text-sm font-medium md:col-span-3">Guardrails and the morning brief</legend>
        <label className="text-sm"><span className="text-gray-600">Your mobile for the brief</span>
          <input className={field} value={f.ownerPhone ?? ""} onChange={(e) => set("ownerPhone", e.target.value)} placeholder="+14165550123" /></label>
        <label className="text-sm"><span className="text-gray-600">Brief at (hour, {f.timezone})</span>
          <input className={field} type="number" min={0} max={23} value={f.briefHour} onChange={(e) => set("briefHour", Number(e.target.value))} /></label>
        <label className="text-sm"><span className="text-gray-600">Timezone</span>
          <input className={field} value={f.timezone} onChange={(e) => set("timezone", e.target.value)} /></label>
        <label className="text-sm"><span className="text-gray-600">Contact customers from (hour)</span>
          <input className={field} type="number" min={6} max={21} value={f.contactFromHour} onChange={(e) => set("contactFromHour", Number(e.target.value))} /></label>
        <label className="text-sm"><span className="text-gray-600">…until (hour)</span>
          <input className={field} type="number" min={8} max={22} value={f.contactToHour} onChange={(e) => set("contactToHour", Number(e.target.value))} /></label>
        <label className="text-sm"><span className="text-gray-600">Max messages/calls per customer a week</span>
          <input className={field} type="number" min={1} max={5} value={f.maxTouchesPerWeek} onChange={(e) => set("maxTouchesPerWeek", Number(e.target.value))} /></label>
      </fieldset>

      {!managed && (<fieldset className="grid gap-4 md:grid-cols-3">
        <legend className="mb-2 text-sm font-medium md:col-span-3">Connected tools</legend>
        <label className="text-sm"><span className="text-gray-600">WayneRing URL {tools.wayneRing ? "· connected" : ""}</span>
          <input className={field} value={f.wayneRingBaseUrl ?? ""} onChange={(e) => set("wayneRingBaseUrl", e.target.value)} placeholder="https://api.wayneringai.com" /></label>
        <label className="text-sm"><span className="text-gray-600">WayneRing callback key {settings.wayneRingCallbackKeySet ? "(set — paste to replace)" : ""}</span>
          <input className={field} value={f.wayneRingCallbackKey} onChange={(e) => set("wayneRingCallbackKey", e.target.value)} placeholder="wrcb_…" autoComplete="off" /></label>
        <label className="text-sm"><span className="text-gray-600">GMB Manager location id {tools.gmb ? "· connected" : ""}</span>
          <input className={field} value={f.gmbLocationId ?? ""} onChange={(e) => set("gmbLocationId", e.target.value)} /></label>
        <label className="text-sm"><span className="text-gray-600">Video Studio client id {tools.videoStudio ? "· connected" : ""}</span>
          <input className={field} value={f.videoStudioClientId ?? ""} onChange={(e) => set("videoStudioClientId", e.target.value)} /></label>
      </fieldset>)}

      <div className="flex items-center gap-3">
        <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Save</button>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>
    </form>
  );
}
