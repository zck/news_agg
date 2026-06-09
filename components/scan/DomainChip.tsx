// /Users/montysharma/Projects/news_agg/news_agg/components/scan/DomainChip.tsx

"use client";

import type { ArticleDomain } from "@/lib/types";
import { getDomain } from "@/lib/scanViewModel";

type Size = "xs" | "sm" | "md";

type DomainChipProps = {
  domain: ArticleDomain;
  size?: Size;
};

const SIZES: Record<Size, { fs: number; px: number; py: number }> = {
  xs: { fs: 9,  px: 6, py: 2 },
  sm: { fs: 10, px: 7, py: 2 },
  md: { fs: 11, px: 9, py: 3 },
};

export function DomainChip({ domain, size = "sm" }: DomainChipProps) {
  const d = getDomain(domain);
  const s = SIZES[size];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded font-bold uppercase tracking-[0.04em]"
      style={{
        fontSize: s.fs,
        padding: `${s.py}px ${s.px}px`,
        background: d.soft,
        color: d.ink,
      }}
    >
      <span className="inline-block h-1 w-1 rounded-full" style={{ width: 5, height: 5, background: d.color }} />
      {d.label}
    </span>
  );
}
