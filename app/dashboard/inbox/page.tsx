import Link from "next/link";
import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { smsConfigured, smsUsageThisMonth } from "@/lib/sms";
import { InboxReply } from "@/components/inbox-reply";
import { canSendWhatsApp, whatsappUsageThisMonth } from "@/lib/whatsapp-send";
import { failureReason, sharedDisplayNumber, whatsappSenderFor, windowOpen } from "@/lib/whatsapp-sender";
import { formatDateTime } from "@/lib/format";
import { customerLabel, instagramAllowed, instagramWindowOpen } from "@/lib/instagram";

export const dynamic = "force-dynamic";

const PURPOSE_LABEL: Record<string, string> = {
  MISSED_CALL: "Missed-call message", REVIEW_REQUEST: "Review request", WINBACK: "Win-back", FOLLOW_UP: "Follow-up", BOOKING_LINK: "Booking link (sent automatically)", REPLY: "", OTHER: "",
};

/**
 * Two-way inbox (WhatsApp + SMS + Instagram DMs): every customer message lands here (and is
 * forwarded to the owner's phone if set). The owner replies from the thread
 * view, on the channel the customer last wrote on.
 */
export default async function InboxPage({ searchParams }: { searchParams: { c?: string } }) {
  const business = await getCurrentBusiness();
  if (!business) return null;

  // Latest message per customer, newest conversation first.
  const recent = await prisma.message.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { customerId: true, text: true, createdAt: true, direction: true },
  });
  const seen = new Set<string>();
  const latest = recent.filter((m) => (seen.has(m.customerId) ? false : (seen.add(m.customerId), true))).slice(0, 100);
  const [customers, unread, usage, waSent, firstLocation] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: latest.map((m) => m.customerId) } }, select: { id: true, name: true, phone: true, instagramUsername: true, smsOptedOut: true, optedOut: true, preferredChannel: true, locationId: true } }),
    prisma.message.groupBy({ by: ["customerId"], where: { businessId: business.id, direction: "INBOUND", readAt: null }, _count: { _all: true } }),
    smsUsageThisMonth(business),
    whatsappUsageThisMonth(business.id),
    prisma.location.findFirst({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const waSender = whatsappSenderFor(firstLocation, business);
  // Times in the business's own time zone (IST for India), not the server's UTC.
  const tz = (await prisma.growthSettings.findUnique({ where: { businessId: business.id }, select: { timezone: true } }))?.timezone ?? null;
  const usesSms = business.defaultChannel === "SMS";
  const byId = new Map(customers.map((c) => [c.id, c]));
  const unreadBy = new Map(unread.map((u) => [u.customerId, u._count._all]));

  const activeId = searchParams.c && byId.has(searchParams.c) ? searchParams.c : latest[0]?.customerId;
  const thread = activeId
    ? await prisma.message.findMany({ where: { customerId: activeId }, orderBy: { createdAt: "asc" }, take: 300 })
    : [];
  if (activeId) {
    await prisma.message.updateMany({ where: { customerId: activeId, direction: "INBOUND", readAt: null }, data: { readAt: new Date() } });
  }
  const active = activeId ? byId.get(activeId) : null;
  const lastIn = [...thread].reverse().find((m) => m.direction === "INBOUND");
  const activeChannel = lastIn?.channel ?? active?.preferredChannel ?? business.defaultChannel;
  const activeLocation = active ? await prisma.location.findUnique({ where: { id: active.locationId } }) : null;
  const replyOnInstagram = activeChannel === "INSTAGRAM";
  const replyOnWhatsApp = !replyOnInstagram && activeChannel === "WHATSAPP" && canSendWhatsApp(business, activeLocation);
  const waWindowOpen = replyOnInstagram
    ? instagramWindowOpen(lastIn?.createdAt ?? null)
    : windowOpen(lastIn?.channel === "WHATSAPP" ? lastIn.createdAt : null);
  const replyChannel = replyOnInstagram ? "INSTAGRAM" : replyOnWhatsApp ? "WHATSAPP" : "SMS";
  const igOn = instagramAllowed(business) && !!firstLocation?.instagramAccountId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
          <span>
            WhatsApp this month: <b>{waSent}</b>
            {waSender
              ? <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-green-800">{waSender.shared ? `Sending from ${sharedDisplayNumber()}` : "Sending from your WhatsApp number"}</span>
              : <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">WhatsApp not connected</span>}
          </span>
          {igOn && <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-800">Instagram DMs on</span>}
          {(usesSms || usage.used > 0) && (
            <span>
              SMS this month: <b>{usage.used}</b>
              {usage.limit != null && <> / {usage.limit} included</>}
              {usage.overage > 0 && <> · {usage.overage} extra (C${usage.overageCad.toFixed(2)})</>}
              {usesSms && !smsConfigured() && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Dry-run: Twilio not configured, nothing is actually sent</span>}
            </span>
          )}
        </p>
      </div>

      {latest.length === 0 ? (
        <div className="rounded-card border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          No messages yet. Customer replies, missed-call messages, review requests and win-backs will show up here.
        </div>
      ) : (
        <div className="grid min-h-[520px] grid-cols-1 overflow-hidden rounded-card border border-gray-200 bg-white md:grid-cols-[300px_1fr]">
          <ul className="max-h-[640px] overflow-y-auto border-b border-gray-200 md:border-b-0 md:border-r">
            {latest.map((m) => {
              const c = byId.get(m.customerId);
              const n = unreadBy.get(m.customerId) ?? 0;
              return (
                <li key={m.customerId}>
                  <Link href={`/dashboard/inbox?c=${m.customerId}`}
                    className={`block px-4 py-3 hover:bg-gray-50 ${m.customerId === activeId ? "bg-brand-50" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${n ? "font-semibold" : "font-medium"}`}>{c ? customerLabel(c) : ""}</span>
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
                <div className="font-medium">{customerLabel(active)}</div>
                <div className="text-xs text-gray-500">
                  {replyOnInstagram
                    ? <>Instagram{active.instagramUsername ? ` · @${active.instagramUsername}` : ""}</>
                    : <>+{active.phone} · {replyOnWhatsApp ? "WhatsApp" : "SMS"}{active.smsOptedOut && " · opted out of texts (replied STOP)"}{active.optedOut && " · opted out of WhatsApp"}</>}
                </div>
              </header>
            )}
            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.direction === "OUTBOUND" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-900"}`}>
                    {m.purpose && PURPOSE_LABEL[m.purpose] && <div className="mb-0.5 text-[11px] opacity-75">{PURPOSE_LABEL[m.purpose]}</div>}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <div className="mt-0.5 text-[11px] opacity-60">
                      {m.channel === "WHATSAPP" ? "WhatsApp · " : m.channel === "INSTAGRAM" ? "Instagram · " : "SMS · "}
                      {formatDateTime(m.createdAt, business.country, tz)}
                      {m.direction === "OUTBOUND" && m.status && ` · ${m.status.toLowerCase().replace("_", " ")}`}
                    </div>
                    {m.direction === "OUTBOUND" && m.status === "FAILED" && m.channel === "WHATSAPP" && (
                      <div className="mt-1 rounded bg-white/90 px-2 py-1 text-[11px] text-red-700">{failureReason(m.rawPayload) ?? "Not delivered"}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {active && (
              <InboxReply
                customerId={active.id}
                channel={replyChannel}
                windowOpen={waWindowOpen}
                neverWrote={!thread.some((m) => m.direction === "INBOUND" && m.channel === "WHATSAPP")}
                disabled={replyOnInstagram ? false : replyOnWhatsApp ? active.optedOut : active.smsOptedOut}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
