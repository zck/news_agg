
"use client";

import type { TrendDir } from "@/lib/scanViewModel";

type Size = "xs" | "sm" | "md";

type TrendPillProps = {
  delta: number;
  dir: TrendDir;
  size?: Size;
};

const SIZES: Record<Size, number> = { xs: 9, sm: 10, md: 11 };

export function TrendPill({ delta, dir, size = "sm" }: TrendPillProps) {
  const flat = dir === "flat" || delta === 0;
  const positive = dir === "up";
  const color = flat ? "#64748b" : positive ? "#047857" : "#be123c";
  const bg = flat ? "#f1f5f9" : positive ? "#ecfdf5" : "#fee2e2";
  const arrow = flat ? "→" : positive ? "↑" : "↓";
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded font-bold font-mono"
      style={{
        fontSize: SIZES[size],
        padding: "2px 6px",
        background: bg,
        color,
      }}
    >
      <span>{arrow}</span>
      <span>{Math.abs(delta)}%</span>
    </span>
  );
}
