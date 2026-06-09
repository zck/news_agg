// /Users/montysharma/Projects/news_agg/news_agg/components/scan/TerminalRow.tsx

"use client";

import { memo, type CSSProperties, type KeyboardEvent } from "react";
import { Sparkline } from "@/components/Sparkline";
import { DomainChip } from "@/components/scan/DomainChip";
import { ConfidencePill } from "@/components/scan/ConfidencePill";
import { TrendPill } from "@/components/scan/TrendPill";
import { InterestRater } from "@/components/scan/InterestRater";
import { getDomain, type InterestLevel, type ScanRow } from "@/lib/scanViewModel";

type TerminalRowProps = {
  row: ScanRow;
  selected: boolean;
  interest: InterestLevel | null;
  inTeaching: boolean;
  onSelect: () => void;
  onRate: (next: InterestLevel | null) => void;
  onTag: (tag: string) => void;
};

function TerminalRowImpl({
  row,
  selected,
  interest,
  inTeaching,
  onSelect,
  onRate,
  onTag,
}: TerminalRowProps) {
  const d = getDomain(row.domain);
  const dim = interest === 1; // Skip → fade
  const elev = interest === 4; // Important → emphasize

  const borderColor = selected ? d.color : elev ? "#0284c7" : "#e2e8f0";
  const leftColor = selected ? d.color : elev ? "#0284c7" : d.color;
  const sparkColor = row.trendDir === "up" ? "#047857" : row.trendDir === "down" ? "#be123c" : "#64748b";

  const style: CSSProperties = {
    cursor: "pointer",
    background: "#fff",
    borderTop: `1px solid ${borderColor}`,
    borderRight: `1px solid ${borderColor}`,
    borderBottom: `1px solid ${borderColor}`,
    borderLeft: `3px solid ${leftColor}`,
    borderRadius: 10,
    padding: "12px 16px",
    opacity: dim ? 0.5 : 1,
    boxShadow: selected ? "0 4px 12px rgba(2,132,199,0.12)" : "none",
    transition: "all .15s",
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
  };

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Impact ${row.impact.toFixed(1)}: ${row.headline}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
      style={style}
    >
      {/* Impact + sparkline */}
      <div className="shrink-0 text-center" style={{ width: 64 }}>
        <div
          className="font-mono font-bold"
          style={{ fontSize: 22, color: "#020617", lineHeight: 1 }}
        >
          {row.impact.toFixed(1)}
        </div>
        <div
          className="font-bold uppercase tracking-[0.1em]"
          style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}
        >
          impact
        </div>
        <div style={{ marginTop: 6 }}>
          <Sparkline data={row.spark} color={sparkColor} width={56} height={14} fill={false} strokeWidth={1.5} />
        </div>
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <DomainChip domain={row.domain} size="xs" />
          <ConfidencePill confidence={row.confidence} />
          <TrendPill delta={row.trendDelta} dir={row.trendDir} />
          <span className="font-mono" style={{ fontSize: 10, color: "#94a3b8" }}>
            {row.sourceCount} src · {row.articleCount} art
          </span>
          {inTeaching ? (
            <span
              className="font-bold"
              style={{
                fontSize: 10,
                color: "#0f766e",
                background: "#ccfbf1",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              📚 saved
            </span>
          ) : null}
        </div>
        <h3
          className="font-semibold tracking-[-0.005em]"
          style={{
            margin: "2px 0 4px",
            fontSize: 15,
            color: "#020617",
            lineHeight: 1.35,
          }}
        >
          {row.headline}
        </h3>
        {row.summary ? (
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "#475569",
              lineHeight: 1.55,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {row.summary}
          </p>
        ) : null}
        {row.tags.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {row.tags.slice(0, 4).map((t) => (
              <button
                key={t}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTag(t);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="font-medium hover:bg-slate-100 hover:border-slate-300"
                style={{
                  fontSize: 10,
                  padding: "2px 7px",
                  borderRadius: 4,
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                #{t}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Right: interest column */}
      <div
        className="shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <InterestRater value={interest} onChange={onRate} size="sm" layout="col" />
      </div>
    </article>
  );
}

export const TerminalRow = memo(TerminalRowImpl);
