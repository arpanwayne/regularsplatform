import { prisma } from "@/lib/prisma";
import { OwnerAdminTable } from "@/components/admin/owner-admin-table";

export const dynamic = "force-dynamic";

export default async function AdminOwnersPage() {
  const owners = await prisma.user.findMany({
    where: { role: "OWNER" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      businesses: { select: { id: true, name: true, sector: true, status: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Owners</h1>
        <p className="text-sm text-gray-500">
          Reset an owner&rsquo;s password when they&rsquo;ve lost access to their email (no
          self-service &ldquo;forgot password&rdquo; flow exists yet).
        </p>
      </div>
      <OwnerAdminTable owners={owners} />
    </div>
  );
}
