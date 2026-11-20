import { prisma } from "@/lib/prisma";
import { getOwnerBusinessOrRedirect } from "@/lib/session";
import { TeamManager } from "@/components/team-manager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const business = await getOwnerBusinessOrRedirect();
  if (!business) return null;
  const managers = await prisma.user.findMany({
    where: { managedBusinessId: business.id, role: "MANAGER" },
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { createdAt: "asc" },
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-gray-600">
          Managers add customers, write offers and answer the inbox. Billing, settings and approvals stay with you.
          Offers above your limits come to your WhatsApp for APPROVE or REJECT.
        </p>
      </div>
      <TeamManager managers={managers} />
    </div>
  );
}
