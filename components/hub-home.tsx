import Link from "next/link";
import type { Business, ToolAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/stat-card";
import { DAY, getSettings, money } from "@/lib/growth/settings";
import { accountData } from "@/lib/hub/provision";
import { BUNDLE_PLANS, TOOL_META, isBundlePlan, type Tool } from "@/lib/hub/plans";

const HUB_MSG: Record<string, string> = {
  "not-in-plan": "That tool isn't part of your plan. Upgrade on the Billing page to add it.",
  "plan-inactive": "Your plan isn't active, so your tools are paused. Pay on the Billing page to switch them back on.",
  "setting-up": "We're still setting that tool up for you. It usually takes a minute — refresh shortly.",
  unknown: "That link didn't work.",
};

type Acc = Pick<ToolAccount, "tool" | "status" | "data" | "lastError">;

function statusOf(a: Acc | undefined, live: boolean) {
  if (!live) return { label: "Paused", tone: "bg-gray-100 text-gray-600" };
  if (!a || a.status === "PENDING") return { label: "Setting up", tone: "bg-amber-50 text-amber-800" };
  if (a.status === "FAILED") return { label: "Needs our team", tone: "bg-red-50 text-red-700" };
  if (a.status === "PAUSED") return { label: "Paused", tone: "bg-gray-100 text-gray-600" };
  return { label: "Ready", tone: "bg-green-50 text-green-800" };
}

/**
 * The one dashboard: Growth AI up top, then every tool in the plan with a
 * one-click sign-in, and a set-up checklist until everything is connected.
 */
export async function HubHome({ business, hubMessage }: { business: Business; hubMessage?: string }) {
  if (!isBundlePlan(business.frontDeskPlan)) return null;
  const plan = BUNDLE_PLANS[business.frontDeskPlan];
  const s = await getSettings(business);
  const since = new Date(Date.now() - 7 * DAY);
  const [accounts, waiting, won, events] = await Promise.all([
    prisma.toolAccount.findMany({ where: { businessId: business.id } }),
    prisma.growthAction.count({ where: { businessId: business.id, status: "PROPOSED" } }),
    prisma.growthAction.findMany({ where: { businessId: business.id, outcome: "WON", outcomeAt: { gte: since } }, select: { outcomeValue: true } }),
    prisma.growthEvent.groupBy({ by: ["type"], where: { businessId: business.id, occurredAt: { gte: since } }, _count: true }),
  ]);
  const count = (...types: string[]) => events.filter((e) => types.includes(e.type)).reduce((t, e) => t + e._count, 0);
  const acc = (t: Tool) => accounts.find((a) => a.tool === t);
  const live = business.bundleStatus === "ACTIVE";
  const wr = accountData<{ phoneNumber?: string | null; assistantStatus?: string }>(acc("WAYNERING"));
  const gmb = accountData<{ connected?: boolean }>(acc("GMB"));

  const steps = [
    { done: live, text: "Plan paid", href: "/dashboard/billing" },
    { done: acc("WAYNERING")?.status === "ACTIVE", text: "AI receptionist account created" },
    { done: !!wr.phoneNumber, text: wr.phoneNumber ? `Calls answered on ${wr.phoneNumber}` : "Phone number connected (our team sets this up with you)" },
    ...(plan.tools.includes("FIELD_SERVICE") ? [{ done: acc("FIELD_SERVICE")?.status === "ACTIVE", text: "Field Service CRM account created" }] : []),
    ...(plan.tools.includes("GMB") ? [{ done: !!gmb.connected, text: gmb.connected ? "Google listing connected" : "Connect your Google listing (open Google profile below)" }] : []),
    ...(plan.growthManager ? [{ done: !!s.ownerPhone, text: "Mobile number for the morning plan", href: "/dashboard/growth" }] : []),
  ];
  const allDone = steps.every((x) => x.done);

  return (
    <section className="space-y-6">
      {hubMessage && HUB_MSG[hubMessage] && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{HUB_MSG[hubMessage]}</div>}
      {business.bundleStatus === "PENDING_PAYMENT" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-5 py-4">
          <div><p className="font-medium">One step left: pay for {plan.name}</p><p className="text-sm text-gray-600">Everything is set up automatically the moment it&apos;s paid.</p></div>
          <Link href="/dashboard/billing" className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Go to payment</Link>
        </div>
      )}
      {business.bundleStatus === "LAPSED" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm text-red-800">Your plan ended and your tools are paused. Your data is safe.</p>
          <Link href="/dashboard/billing" className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Reactivate</Link>
        </div>
      )}

      <div>
        <h1 className="text-xl font-semibold">Good to see you</h1>
        <p className="text-sm text-gray-500">{business.name} · {plan.name} plan · everything in one place</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Calls answered, 7 days" value={count("CALL_ANSWERED", "CALLBACK_ANSWERED")} hint={`${count("CALL_MISSED")} missed`} />
        {plan.growthManager ? <StatCard label="Waiting for your OK" value={waiting} hint="Approve in Growth AI or reply to the morning text" /> : <StatCard label="Messages in, 7 days" value={count("MESSAGE_IN")} />}
        {plan.growthManager ? <StatCard label="Revenue influenced, 7 days" value={money(s, won.reduce((t, r) => t + (r.outcomeValue ?? 0), 0))} hint={`${won.length} wins`} /> : <StatCard label="Bookings, 7 days" value={count("BOOKING")} />}
        {plan.tools.includes("FIELD_SERVICE") ? <StatCard label="Jobs done, 7 days" value={count("JOB_DONE")} hint={`${count("QUOTE_ACCEPTED")} quotes accepted`} /> : <StatCard label="New Google reviews, 7 days" value={count("REVIEW_RECEIVED")} />}
      </div>

      {!allDone && live && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 font-medium">Getting you set up</h2>
          <ol className="space-y-2 text-sm">
            {steps.map((x) => (
              <li key={x.text} className="flex items-center gap-2">
                <span className={x.done ? "text-green-600" : "text-gray-300"} aria-hidden>{x.done ? "●" : "○"}</span>
                {x.href && !x.done ? <Link href={x.href} className="text-brand-700 underline">{x.text}</Link> : <span className={x.done ? "text-gray-500" : ""}>{x.text}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plan.growthManager && (
          <Tile name="Growth AI" blurb="Today's plan: who to call back, remind and win back" status={{ label: s.enabled ? "On" : "Off", tone: s.enabled ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600" }}
            links={[{ href: "/dashboard/growth", label: waiting ? `Review ${waiting} action${waiting === 1 ? "" : "s"}` : "Open Growth AI" }]} />
        )}
        <Tile name="Customers & inbox" blurb="Everyone who called, texted or booked, on one timeline" status={{ label: "Ready", tone: "bg-green-50 text-green-800" }}
          links={[{ href: "/dashboard/customers", label: "Customers" }, { href: "/dashboard/inbox", label: "Inbox" }]} />
        {plan.tools.map((t) => {
          const a = acc(t);
          const st = statusOf(a, live);
          const ready = st.label === "Ready";
          const links =
            t === "WAYNERING" ? [{ href: "/api/hub/open/wayneRing?page=calls", label: "Calls ↗", external: true }, { href: "/api/hub/open/wayneRing?page=receptionist", label: "Receptionist ↗", external: true }]
            : t === "FIELD_SERVICE" ? [{ href: "/api/hub/open/field-service", label: "Schedule & jobs ↗", external: true }]
            : t === "GMB" ? [{ href: "/api/hub/open/gmb", label: "Open Google profile ↗", external: true }, { href: "/dashboard/growth", label: "AI suggestions" }]
            : [{ href: "/api/hub/open/video?page=make", label: "Make an ad ↗", external: true }, { href: "/dashboard/growth", label: "Reel ideas" }];
          const note = t === "GMB" && ready && !gmb.connected ? "Open it to connect your Google listing" : t === "WAYNERING" && ready && wr.phoneNumber ? wr.phoneNumber : TOOL_META[t].ownerLogin ? null : "Run for you by our team";
          return <Tile key={t} name={TOOL_META[t].name} blurb={TOOL_META[t].blurb} status={st} note={note} links={ready || !TOOL_META[t].ownerLogin ? links : []} />;
        })}
      </div>
    </section>
  );
}

function Tile({ name, blurb, status, note, links }: { name: string; blurb: string; status: { label: string; tone: string }; note?: string | null; links: { href: string; label: string; external?: boolean }[] }) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div><h3 className="font-medium">{name}</h3><p className="text-sm text-gray-600">{blurb}</p></div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${status.tone}`}>{status.label}</span>
      </div>
      {note && <p className="text-xs text-gray-500">{note}</p>}
      {links.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-2">
          {links.map((l) => l.external
            ? <a key={l.href} href={l.href} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">{l.label}</a>
            : <Link key={l.href} href={l.href} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">{l.label}</Link>)}
        </div>
      )}
    </article>
  );
}
