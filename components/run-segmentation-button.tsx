"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunSegmentationButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    await fetch("/api/segmentation/run", { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
    >
      {loading ? "Recomputing…" : "Recompute segments"}
    </button>
  );
}
