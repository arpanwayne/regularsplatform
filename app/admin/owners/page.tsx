import { prisma } from "@/lib/prisma";
import { OwnerAdminTable } from "@/components/admin/owner-admin-table";

export const dynamic = "force-dynamic";

export default async function AdminOwnersPage() {
  // Everyone who owns a business — including a super admin who also runs a
  // test business ("real pro media" was missing, bug B13).
  const owners = await prisma.user.findMany({
    // An owner left without any business stays visible.
    where: { OR: [{ businesses: { some: {} } }, { role: "OWNER", businesses: { none: {} } }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      businesses: { select: { id: true, name: true, sector: true, status: true } },
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
