import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/stat-card";
import { GrowthActionCard, PlanNowButton } from "@/components/growth-actions";
import { GrowthSettingsForm } from "@/components/growth-settings";
import { DAY, autonomyMap, getSettings, money, parseJson } from "@/lib/growth/settings";
import { gmb, videoStudio, wayneRing } from "@/lib/growth/connectors";
import { ACTION_LABEL, type ActionType } from "@/lib/growth/types";

export const dynamic = "force-dynamic";

/**
 * AI Growth Manager — what the brain wants to do today (approve / edit /
 * skip), what it did and what came of it, and how much it may do alone.
 */
export default async function GrowthPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;
  const s = await getSettings(business);
  const now = new Date();
  const since = new Date(now.getTime() - 7 * DAY);

  const [proposed, recent, won7, done7, won30] = await Promise.all([
    prisma.growthAction.findMany({ where: { businessId: business.id, status: { in: ["PROPOSED", "APPROVED"] } }, include: { customer: true }, orderBy: [{ priority: "desc" }], take: 50 }),
    prisma.growthAction.findMany({ where: { businessId: business.id, status: { in: ["DONE", "FAILED", "EXECUTING"] } }, include: { customer: true }, orderBy: { updatedAt: "desc" }, take: 25 }),
    prisma.growthAction.findMany({ where: { businessId: business.id, outcome: "WON", outcomeAt: { gte: since } }, select: { outcomeValue: true } }),
    prisma.growthAction.count({ where: { businessId: business.id, status: "DONE", executedAt: { gte: since } } }),
    prisma.growthAction.findMany({ where: { businessId: business.id, outcome: "WON", outcomeAt: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { outcomeValue: true } }),
  ]);
  const sum = (rows: { outcomeValue: number | null }[]) => rows.reduce((t, r) => t + (r.outcomeValue ?? 0), 0);
  const tools = { wayneRing: wayneRing.available(s), gmb: gmb.available(s), videoStudio: videoStudio.available(s) };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">AI Growth Manager</h1>
          <p className="max-w-2xl text-sm text-gray-600">
            Every day it reads your calls, texts, quotes, jobs and reviews, picks the actions most likely to bring in work,
            and asks you before it contacts anyone. {s.enabled ? "It's on." : "It's off — turn it on in the settings below."}
          </p>
        </div>
        <PlanNowButton disabled={business.status === "SUSPENDED"} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue influenced, 7 days" value={money(s, sum(won7))} hint={`${won7.length} customers booked or came back`} />
        <StatCard label="Revenue influenced, 30 days" value={money(s, sum(won30))} hint={`${won30.length} wins`} />
        <StatCard label="Actions taken, 7 days" value={done7} />
        <StatCard label="Waiting for you" value={proposed.filter((a) => a.status === "PROPOSED").length} hint="Approve here or reply to the morning text" />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Today&apos;s plan</h2>
        {proposed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            Nothing waiting. The next plan is made at {String(s.briefHour).padStart(2, "0")}:00 ({s.timezone}), or press &ldquo;Plan now&rdquo;.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {proposed.map((a) => {
              const p = parseJson<{ message?: string; reply?: string; channel?: string; comment?: string }>(a.payload, {});
              return (
                <GrowthActionCard key={a.id} id={a.id} status={a.status} title={a.title} reason={a.reason}
                  kind={ACTION_LABEL[a.type as ActionType]?.one ?? a.type} channel={p.channel ?? null}
                  text={a.type === "REVIEW_REPLY" ? p.reply ?? null : p.message ?? null} quote={a.type === "REVIEW_REPLY" ? p.comment ?? null : null}
                  value={a.expectedValue > 0 ? money(s, a.expectedValue) : null} autonomy={a.autonomy} />
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">What it did</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr><th className="px-4 py-2 font-medium">When</th><th className="px-4 py-2 font-medium">Action</th><th className="px-4 py-2 font-medium">Result</th><th className="px-4 py-2 font-medium">Outcome</th></tr>
            </thead>
            <tbody>
              {recent.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No actions yet.</td></tr>}
              {recent.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-500">{(a.executedAt ?? a.updatedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="px-4 py-2">{a.title}</td>
                  <td className="px-4 py-2">{a.status === "DONE" ? "Done" : a.status === "FAILED" ? <span className="text-red-600" title={a.error ?? ""}>Failed</span> : "Running"}</td>
                  <td className="px-4 py-2">{a.outcome === "WON" ? <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">Won {a.outcomeValue != null ? money(s, a.outcomeValue) : ""}</span> : <span className="text-gray-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">&ldquo;Won&rdquo; means the customer booked, accepted a quote, paid or visited within 14 days of the action (last-touch). It shows revenue the AI influenced, not proof it caused it.</p>
      </section>

      <GrowthSettingsForm
        settings={{
          enabled: s.enabled, goal: s.goal, timezone: s.timezone, currency: s.currency, avgJobValue: s.avgJobValue,
          messageLanguage: s.messageLanguage, briefHour: s.briefHour, contactFromHour: s.contactFromHour, contactToHour: s.contactToHour,
          maxTouchesPerWeek: s.maxTouchesPerWeek, dailyActionCap: s.dailyActionCap, serviceIntervalDays: s.serviceIntervalDays,
          quoteFollowupDays: s.quoteFollowupDays, callQuoteAbove: s.callQuoteAbove, ownerPhone: s.ownerPhone,
          wayneRingBaseUrl: s.wayneRingBaseUrl, wayneRingCallbackKeySet: !!s.wayneRingCallbackKey,
          gmbLocationId: s.gmbLocationId, videoStudioClientId: s.videoStudioClientId,
        }}
        autonomy={autonomyMap(s)} tools={tools}
      />
    </div>
  );
}
