const STYLES: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  REGULAR: "bg-brand-100 text-brand-700",
  AT_RISK: "bg-amber-100 text-amber-700",
  HIGH_SPENDER: "bg-purple-100 text-purple-700",
  DORMANT: "bg-gray-200 text-gray-700",
};

const LABELS: Record<string, string> = {
  NEW: "New",
  REGULAR: "Regular",
  AT_RISK: "At-risk",
  HIGH_SPENDER: "High spender",
  DORMANT: "Dormant",
};

export function SegmentBadge({ segment }: { segment: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STYLES[segment] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {LABELS[segment] ?? segment}
    </span>
  );
}
