import { runComplianceChecks } from "@/lib/compliance-check";

export const dynamic = "force-dynamic";

const LEVEL_STYLES: Record<string, string> = {
  PASS: "bg-brand-100 text-brand-700",
  WARN: "bg-amber-100 text-amber-700",
  FAIL: "bg-red-100 text-red-700",
};

export default async function AdminCompliancePage() {
  const results = await runComplianceChecks();
  const failCount = results.filter((r) => r.level === "FAIL").length;
  const warnCount = results.filter((r) => r.level === "WARN").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Compliance self-check</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          Automated checks for what this codebase actually controls. This is <b>not</b> a
          substitute for a human review of your live Meta Business Manager setup (opt-in policy,
          24-hour messaging window, template category approval) — see{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">COMPLIANCE.md</code> in the repo for
          that checklist.
        </p>
      </div>

      {failCount === 0 && warnCount === 0 ? (
        <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Sab automated checks pass ho rahe hain.
        </div>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {failCount} FAIL, {warnCount} WARN — neeche detail dekho.
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Level</th>
              <th className="px-4 py-2 font-medium">Scope</th>
              <th className="px-4 py-2 font-medium">Check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {results.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_STYLES[r.level]}`}
                  >
                    {r.level}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{r.scope}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-gray-500">{r.detail}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
