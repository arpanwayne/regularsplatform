import { prisma } from "@/lib/prisma";
import { OwnerAdminTable } from "@/components/admin/owner-admin-table";
import { businessWhere, currentPortal } from "@/lib/portal";

export const dynamic = "force-dynamic";

export default async function AdminOwnersPage() {
  // Everyone who owns a business — including a super admin who also runs a
  // test business ("real pro media" was missing, bug B13).
  // Only owners of this portal's businesses (Loopdesk bundle vs Regulars plan).
  const portal = currentPortal();
  const biz = businessWhere(portal);
  const owners = await prisma.user.findMany({
    // An owner left without any business stays visible on Regulars.
    where: portal === "REGULARS" ? { OR: [{ businesses: { some: biz } }, { role: "OWNER", businesses: { none: {} } }] } : { businesses: { some: biz } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      businesses: { where: biz, select: { id: true, name: true, sector: true, status: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Owners</h1>
        <p className="text-sm text-gray-500">
          Owners can reset their own password from &ldquo;Forgot password?&rdquo; on the login page
          (an email link). Use Reset password here when they can&rsquo;t get that email.
        </p>
      </div>
      <OwnerAdminTable owners={owners} />
    </div>
  );
}
