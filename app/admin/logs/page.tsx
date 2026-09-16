import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const LEVEL_STYLES: Record<string, string> = {
  INFO: "bg-blue-100 text-blue-700",
  WARN: "bg-amber-100 text-amber-700",
  ERROR: "bg-red-100 text-red-700",
};

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: { level?: string };
}) {
  const level = ["INFO", "WARN", "ERROR"].includes(searchParams.level ?? "")
    ? searchParams.level
    : undefined;

  const logs = await prisma.systemLog.findMany({
    where: level ? { level } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { business: { select: { name: true } } },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">System logs</h1>
        <p className="text-sm text-gray-500">
          Latest 100 events — webhook failures, calling-script/voice-call errors, billing
          failures. Ad hoc troubleshooting, not a full observability stack.
        </p>
      </div>

      <div className="flex gap-2">
        {["", "INFO", "WARN", "ERROR"].map((l) => (
          <a
            key={l || "all"}
            href={l ? `/admin/logs?level=${l}` : "/admin/logs"}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              level === l || (!level && !l)
                ? "bg-brand-600 text-white"
                : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {l || "All"}
          </a>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {logs.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">Koi log nahi mila.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Level</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Business</th>
                <th className="px-4 py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        LEVEL_STYLES[log.level] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {log.level}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{log.source}</td>
                  <td className="px-4 py-2 text-gray-600">{log.business?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <p>{log.message}</p>
                    {log.meta && (
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-gray-400">
                        {log.meta}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
