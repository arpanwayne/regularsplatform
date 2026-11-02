import { prisma } from "@/lib/prisma";
import { ApiKeyManager } from "@/components/admin/api-key-manager";

export const dynamic = "force-dynamic";

export default async function AdminApiKeysPage() {
  const [keys, businesses] = await Promise.all([
    prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true,
        business: { select: { id: true, name: true } },
      },
    }),
    prisma.business.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">API keys</h1>
        <p className="text-sm text-gray-500">
          Server-to-server keys for <code>POST /api/v1/events</code>. A connected system (e.g. Sehat Saathi, a POS or a
          booking tool) uses one to report real visits for a business, instead of relying on customer-typed WhatsApp
          keywords. One key per business; revoke any time.
        </p>
      </div>
      <ApiKeyManager keys={JSON.parse(JSON.stringify(keys))} businesses={businesses} />
    </div>
  );
}
