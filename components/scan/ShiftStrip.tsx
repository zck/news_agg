// /Users/montysharma/Projects/news_agg/news_agg/components/scan/ShiftStrip.tsx

"use client";

import { Sparkline } from "@/components/Sparkline";
import { getDomain, type ScanShift } from "@/lib/scanViewModel";

type ShiftStripProps = {
  shifts: ScanShift[];
  activeTag: string | null;
  onTagClick: (tag: string) => void;
};

export function ShiftStrip({ shifts, activeTag, onTagClick }: ShiftStripProps) {
  if (!shifts.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        overflowX: "auto",
      }}
    >
      <div
        className="font-bold uppercase tracking-[0.12em]"
        style={{
          flexShrink: 0,
          fontSize: 10,
          color: "#0369a1",
          paddingRight: 14,
          borderRight: "1px solid #e2e8f0",
          lineHeight: 1.1,
        }}
      >
        What&apos;s
        <br />
        shifting
      </div>
      <div style={{ display: "flex", gap: 8, flex: 1, overflowX: "auto" }}>
        {shifts.map((s) => {
          const d = getDomain(s.domain);
          const positive = s.dir === "up";
          const active = activeTag === s.tag;
          return (
            <button
              key={s.tag}
              type="button"
              onClick={() => onTagClick(s.tag)}
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 8,
                cursor: "pointer",
                border: `1px solid ${active ? "#0284c7" : "#e2e8f0"}`,
                background: active ? "#0284c7" : "#fff",
                color: active ? "#fff" : "#0f172a",
                transition: "all .12s",
              }}
            >
              <Sparkline
                data={s.spark}
                color={active ? "#fff" : positive ? "#047857" : "#be123c"}
                width={36}
                height={14}
                fill={false}
                strokeWidth={1.5}
              />
              <div style={{ textAlign: "left" }}>
                <div className="font-semibold" style={{ fontSize: 12, lineHeight: 1.1 }}>
                  #{s.tag}
                </div>
                <div
                  className="font-mono font-bold"
                  style={{
                    fontSize: 10,
                    marginTop: 2,
                    color: active ? "#fff" : positive ? "#047857" : "#be123c",
                  }}
                >
                  {positive ? "↑" : "↓"} {Math.abs(s.delta)}% · {d.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
