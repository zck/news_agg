
"use client";

import { memo, type CSSProperties, type KeyboardEvent } from "react";
import { Sparkline } from "@/components/Sparkline";
import { getDomain, type InterestLevel, type ScanRow } from "@/lib/scanViewModel";

type DigestRowProps = {
  row: ScanRow;
  index: number;
  selected: boolean;
  interest: InterestLevel | null;
  inTeaching: boolean;
  onSelect: () => void;
  onRate: (next: InterestLevel | null) => void;
};

const QUICK_BTNS: Array<{ v: InterestLevel; sym: string; color: string }> = [
  { v: 4, sym: "★", color: "#0284c7" },
  { v: 1, sym: "✕", color: "#fb7185" },
];

function DigestRowImpl({
  row,
  index,
  selected,
  interest,
  inTeaching,
  onSelect,
  onRate,
}: DigestRowProps) {
  const d = getDomain(row.domain);
  const symbol =
    interest === 4 ? "★" : interest === 3 ? "◆" : interest === 2 ? "◐" : null;
  const symColor =
    interest === 4
      ? "#0284c7"
      : interest === 3
        ? "#0d9488"
        : interest === 2
          ? "#d97706"
          : "#cbd5e1";
  const sparkColor =
    row.trendDir === "up" ? "#047857" : row.trendDir === "down" ? "#be123c" : "#64748b";

  const baseStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 14px",
    borderBottom: "1px solid #f1f5f9",
    // Selected wins via inline style; unselected hover comes from the
    // hover:bg-slate-50 utility on the className below.
    background: selected ? "#f0f9ff" : undefined,
    cursor: "pointer",
    borderLeft: `3px solid ${selected ? d.color : "transparent"}`,
    transition: "background .1s",
  };

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${row.headline} — Impact ${row.impact.toFixed(1)}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={
        (selected ? "" : "hover:bg-slate-50 ") +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-inset"
      }
      style={baseStyle}
    >
      {/* Index */}
      <span
        className="text-right font-mono"
        style={{ width: 22, fontSize: 10, color: "#94a3b8", flexShrink: 0 }}
      >
        {String(index).padStart(2, "0")}
      </span>
      {/* Interest mark */}
      <span
        className="text-center font-bold"
        style={{ width: 14, fontSize: 13, color: symColor, flexShrink: 0 }}
        aria-hidden="true"
      >
        {symbol ?? ""}
      </span>
      {/* Domain dot */}
      <span
        title={d.label}
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: d.color,
          flexShrink: 0,
        }}
      />
      {/* Domain label */}
      <span
        className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold uppercase tracking-[0.04em]"
        style={{ width: 92, fontSize: 10.5, color: "#64748b", flexShrink: 0 }}
      >
        {d.label}
      </span>
      {/* Impact */}
      <span
        className="text-right font-mono font-bold"
        style={{ width: 32, fontSize: 12, color: "#020617", flexShrink: 0 }}
      >
        {row.impact.toFixed(1)}
      </span>
      {/* Spark */}
      <span className="flex shrink-0 items-center">
        <Sparkline data={row.spark} color={sparkColor} width={40} height={11} fill={false} strokeWidth={1.5} />
      </span>
      {/* Trend delta */}
      <span
        className="text-right font-mono font-bold"
        style={{
          width: 36,
          fontSize: 10.5,
          flexShrink: 0,
          color: row.trendDelta > 0 ? "#047857" : row.trendDelta < 0 ? "#be123c" : "#64748b",
        }}
      >
        {row.trendDelta > 0 ? "+" : ""}
        {row.trendDelta}%
      </span>
      {/* Headline */}
      <span
        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium"
        style={{ fontSize: 12.5, color: "#1e293b", lineHeight: 1.4 }}
      >
        {row.headline}
      </span>
      {/* Source count */}
      <span
        className="font-mono"
        style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}
      >
        {row.sourceCount}src
      </span>
      {/* Teaching pin */}
      {inTeaching ? (
        <span
          title="In Teaching Pack"
          style={{ fontSize: 11, color: "#0f766e", flexShrink: 0 }}
        >
          📚
        </span>
      ) : null}
      {/* Quick rater (compact) */}
      <div
        className="flex shrink-0 gap-px"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {QUICK_BTNS.map((b) => (
          <button
            key={b.v}
            type="button"
            aria-label={b.v === 4 ? "Mark important" : "Skip"}
            onClick={() => onRate(interest === b.v ? null : b.v)}
            style={{
              width: 22,
              height: 22,
              padding: 0,
              border: "1px solid #e2e8f0",
              background: interest === b.v ? b.color : "#fff",
              color: interest === b.v ? "#fff" : "#94a3b8",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 700,
              transition: "all .1s",
            }}
          >
            {b.sym}
          </button>
        ))}
      </div>
    </div>
  );
}

export const DigestRow = memo(DigestRowImpl);
