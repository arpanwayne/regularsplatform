import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      name: true,
      usageEvents: {
        select: {
          type: true,
          estimatedCostUsd: true,
          callTriggered: true,
        },
      },
    },
  });

  const rows = businesses.map((b) => {
    const aiEvents = b.usageEvents.filter((e) => e.type === "AI_SCRIPT_PERSONALIZATION");
    const callEvents = b.usageEvents.filter((e) => e.type === "VOICE_CALL" && e.callTriggered);
    return {
      id: b.id,
      name: b.name,
      aiScriptCalls: aiEvents.length,
      estimatedAiCostUsd: aiEvents.reduce((sum, e) => sum + (e.estimatedCostUsd ?? 0), 0),
      voiceCallsTriggered: callEvents.length,
    };
  });

  const totalAiCost = rows.reduce((sum, r) => sum + r.estimatedAiCostUsd, 0);
  const totalAiCalls = rows.reduce((sum, r) => sum + r.aiScriptCalls, 0);
  const totalVoiceCalls = rows.reduce((sum, r) => sum + r.voiceCallsTriggered, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Usage &amp; estimated cost</h1>
        <p className="text-sm text-gray-500">
          AI personalization cost is an estimate from published Claude Haiku token pricing at
          call time — not a billing-grade figure. Voice-call counts are trigger attempts, not
          billed minutes (no provider reports duration back yet).
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="AI script calls" value={totalAiCalls} />
        <StatCard label="Estimated AI cost" value={`$${totalAiCost.toFixed(4)}`} />
        <StatCard label="Voice calls triggered" value={totalVoiceCalls} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Business</th>
              <th className="px-4 py-2 font-medium">AI script calls</th>
              <th className="px-4 py-2 font-medium">Est. AI cost</th>
              <th className="px-4 py-2 font-medium">Voice calls triggered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{r.aiScriptCalls}</td>
                <td className="px-4 py-3">${r.estimatedAiCostUsd.toFixed(4)}</td>
                <td className="px-4 py-3">{r.voiceCallsTriggered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
