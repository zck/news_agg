// /Users/montysharma/Projects/news_agg/news_agg/components/scan/ConfidencePill.tsx

"use client";

import type { Confidence } from "@/lib/scanViewModel";

const MAP: Record<Confidence, { c: string; bg: string }> = {
  high:   { c: "#047857", bg: "#ecfdf5" },
  medium: { c: "#0369a1", bg: "#e0f2fe" },
  low:    { c: "#b45309", bg: "#fffbeb" },
};

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  const m = MAP[confidence];
  return (
    <span
      className="rounded font-semibold uppercase tracking-[0.06em]"
      style={{
        fontSize: 10,
        padding: "2px 6px",
        color: m.c,
        background: m.bg,
      }}
    >
      {confidence}
    </span>
  );
}
