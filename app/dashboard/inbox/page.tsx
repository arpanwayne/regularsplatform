import Link from "next/link";
import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { smsConfigured, smsUsageThisMonth } from "@/lib/sms";
import { InboxReply } from "@/components/inbox-reply";

export const dynamic = "force-dynamic";

const PURPOSE_LABEL: Record<string, string> = {
  MISSED_CALL: "Missed-call text", REVIEW_REQUEST: "Review request", WINBACK: "Win-back", REPLY: "", OTHER: "",
};

/**
 * Two-way SMS inbox: every customer text lands here (and is forwarded to the
 * owner's phone if set). The owner replies from the thread view.
 */
export default async function InboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const business = await getCurrentBusiness();
  if (!business) return null;

  // Latest SMS per customer, newest conversation first.
  const recent = await prisma.message.findMany({
    where: { businessId: business.id, channel: "SMS" },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { customerId: true, text: true, createdAt: true, direction: true },
  });
  const seen = new Set<string>();
  const latest = recent.filter((m) => (seen.has(m.customerId) ? false : (seen.add(m.customerId), true))).slice(0, 100);
  const [customers, unread, usage] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: latest.map((m) => m.customerId) } }, select: { id: true, name: true, phone: true, smsOptedOut: true } }),
    prisma.message.groupBy({ by: ["customerId"], where: { businessId: business.id, channel: "SMS", direction: "INBOUND", readAt: null }, _count: { _all: true } }),
    smsUsageThisMonth(business),
  ]);
  const byId = new Map(customers.map((c) => [c.id, c]));
  const unreadBy = new Map(unread.map((u) => [u.customerId, u._count._all]));

  const activeId = searchParams.c && byId.has(searchParams.c) ? searchParams.c : latest[0]?.customerId;
  const thread = activeId
    ? await prisma.message.findMany({ where: { customerId: activeId, channel: "SMS" }, orderBy: { createdAt: "asc" }, take: 300 })
    : [];
  if (activeId) {
    await prisma.message.updateMany({ where: { customerId: activeId, direction: "INBOUND", readAt: null }, data: { readAt: new Date() } });
  }
  const active = activeId ? byId.get(activeId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-gray-500">
          SMS this month: <b>{usage.used}</b>
          {usage.limit != null && <> / {usage.limit} included</>}
          {usage.overage > 0 && <> · {usage.overage} extra (C${usage.overageCad.toFixed(2)})</>}
          {!smsConfigured() && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">Dry-run: Twilio not configured, nothing is actually sent</span>}
        </p>
      </div>

      {latest.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          No texts yet. Customer replies, missed-call texts, review requests and win-backs will show up here.
        </div>
      ) : (
        <div className="grid min-h-[520px] grid-cols-1 overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-[300px_1fr]">
          <ul className="max-h-[640px] overflow-y-auto border-b border-gray-200 md:border-b-0 md:border-r">
            {latest.map((m) => {
              const c = byId.get(m.customerId);
              const n = unreadBy.get(m.customerId) ?? 0;
              return (
                <li key={m.customerId}>
                  <Link href={`/dashboard/inbox?c=${m.customerId}`}
                    className={`block px-4 py-3 hover:bg-gray-50 ${m.customerId === activeId ? "bg-brand-50" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${n ? "font-semibold" : "font-medium"}`}>{c?.name || `+${c?.phone}`}</span>
                      {n > 0 && <span className="rounded-full bg-brand-600 px-2 text-xs font-semibold text-white">{n}</span>}
                    </div>
                    <p className="truncate text-xs text-gray-500">{m.direction === "OUTBOUND" ? "You: " : ""}{m.text}</p>
                  </Link>
                </li>
              );
            })}
          </ul>

          <section className="flex flex-col">
            {active && (
              <header className="border-b border-gray-200 px-5 py-3">
                <div className="font-medium">{active.name || `+${active.phone}`}</div>
                <div className="text-xs text-gray-500">+{active.phone}{active.smsOptedOut && " · opted out of texts (replied STOP)"}</div>
              </header>
            )}
            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.direction === "OUTBOUND" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-900"}`}>
                    {m.purpose && PURPOSE_LABEL[m.purpose] && <div className="mb-0.5 text-[11px] opacity-75">{PURPOSE_LABEL[m.purpose]}</div>}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <div className="mt-0.5 text-[11px] opacity-60">
                      {m.createdAt.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
                      {m.direction === "OUTBOUND" && m.status && ` · ${m.status.toLowerCase().replace("_", " ")}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {active && <InboxReply customerId={active.id} disabled={active.smsOptedOut} />}
          </section>
        </div>
      )}
    </div>
  );
}
