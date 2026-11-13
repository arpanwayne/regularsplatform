import { prisma } from "@/lib/prisma";
import { WhatsAppTemplatesPanel } from "@/components/admin/whatsapp-templates-panel";
import { sharedDisplayNumber } from "@/lib/whatsapp-sender";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppTemplatesPage() {
  const ownNumbers = await prisma.location.findMany({
    where: { whatsappPhoneNumberId: { not: null }, whatsappAccessToken: { not: null } },
    select: { id: true, name: true, business: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">WhatsApp templates</h1>
        <p className="max-w-3xl text-sm text-gray-500">
          WhatsApp only lets a business start a conversation with a template Meta has approved. These are all the
          templates Regulars uses (missed calls, follow-ups, reminders, win-backs, review requests and the owner&apos;s
          morning brief) in English, Hinglish, Hindi and Punjabi. Submit them once per WhatsApp Business Account —
          the shared number {sharedDisplayNumber()} by default, or a client that connected its own number.
        </p>
      </div>
      <WhatsAppTemplatesPanel
        accounts={[
          { id: "", label: `Shared number ${sharedDisplayNumber()}` },
          ...ownNumbers.map((l) => ({ id: l.id, label: `${l.business.name} · ${l.name} (own number)` })),
        ]}
      />
    </div>
  );
}
