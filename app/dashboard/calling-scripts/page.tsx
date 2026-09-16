import { getCurrentBusiness } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { allTemplatesForSector } from "@/lib/calling-scripts/templates";
import { SegmentBadge } from "@/components/segment-badge";
import type { Sector } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CallingScriptsPage() {
  const business = await getCurrentBusiness();
  if (!business) return null;

  const [templates, generated] = await Promise.all([
    allTemplatesForSector(business.sector as Sector),
    prisma.callingScript.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Calling scripts</h1>
        <p className="text-sm text-gray-500">
          Default Hinglish {business.sector.toLowerCase()} scripts, ek per segment. Kisi bhi
          customer ke liye personalized version Customers page se generate karo.
        </p>
      </div>

      <div>
        <h2 className="font-medium mb-3">Default templates</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <div key={t.segment} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{t.title}</p>
                <SegmentBadge segment={t.segment} />
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{t.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-medium mb-3">Recently generated</h2>
        {generated.length === 0 ? (
          <p className="text-sm text-gray-500">
            Abhi tak koi personalized script generate nahi hua.
          </p>
        ) : (
          <div className="space-y-3">
            {generated.map((g) => (
              <div key={g.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm">{g.title}</p>
                  <SegmentBadge segment={g.segment} />
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{g.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
