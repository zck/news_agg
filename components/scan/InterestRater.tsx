
"use client";

import { useState, type CSSProperties } from "react";
import { INTEREST_LEVELS, type InterestLevel } from "@/lib/scanViewModel";

type Size = "sm" | "md" | "lg";
type Layout = "row" | "col";

type InterestRaterProps = {
  value: InterestLevel | null;
  onChange: (next: InterestLevel | null) => void;
  size?: Size;
  layout?: Layout;
  showLearningHint?: boolean;
};

const SIZES: Record<Size, { h: number; fs: number; px: number; gap: number }> = {
  sm: { h: 22, fs: 10, px: 8,  gap: 3 },
  md: { h: 26, fs: 11, px: 10, gap: 4 },
  lg: { h: 32, fs: 12, px: 14, gap: 6 },
};

export function InterestRater({
  value,
  onChange,
  size = "md",
  layout = "row",
  showLearningHint = false,
}: InterestRaterProps) {
  const s = SIZES[size];
  const [hoveredId, setHoveredId] = useState<InterestLevel | null>(null);
  const containerStyle: CSSProperties = {
    display: "flex",
    gap: s.gap,
    flexDirection: layout === "col" ? "column" : "row",
  };
  return (
    <div style={containerStyle}>
      {INTEREST_LEVELS.map((level) => {
        const active = value === level.id;
        const hovering = !active && hoveredId === level.id;
        const buttonStyle: CSSProperties = {
          height: s.h,
          padding: `0 ${s.px}px`,
          fontSize: s.fs,
          fontWeight: 600,
          lineHeight: 1,
          borderRadius: 6,
          border: `1px solid ${active ? level.color : hovering ? level.color : "#e2e8f0"}`,
          background: active ? level.color : "#fff",
          color: active ? "#fff" : hovering ? level.color : "#475569",
          cursor: "pointer",
          transition: "all .12s",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        };
        return (
          <button
            key={level.id}
            type="button"
            title={level.label}
            aria-label={level.label}
            aria-pressed={active}
            onClick={(e) => {
              e.stopPropagation();
              onChange(active ? null : level.id);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            onMouseEnter={() => setHoveredId(level.id)}
            onMouseLeave={() => setHoveredId((curr) => (curr === level.id ? null : curr))}
            onFocus={() => setHoveredId(level.id)}
            onBlur={() => setHoveredId((curr) => (curr === level.id ? null : curr))}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1"
            style={buttonStyle}
          >
            <span style={{ fontSize: s.fs - 1, opacity: 0.85 }} aria-hidden="true">
              {level.glyph}
            </span>
            <span>{level.short}</span>
          </button>
        );
      })}
      {showLearningHint && value != null ? (
        <span
          className="self-center font-semibold uppercase tracking-[0.1em]"
          style={{ fontSize: 10, color: "#047857", marginLeft: 6 }}
        >
          → learning
        </span>
      ) : null}
    </div>
  );
}
