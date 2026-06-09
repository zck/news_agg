// /Users/montysharma/Projects/news_agg/news_agg/components/scan/ExportPreview.tsx

"use client";

import { useState, type CSSProperties } from "react";
import { buildSlideOutline, buildTeachingMarkdown } from "@/lib/scanExport";
import type { ScanRow } from "@/lib/scanViewModel";

type Mode = "brief" | "slides";

const previewTab = (active: boolean): CSSProperties => ({
  fontSize: 11,
  padding: "3px 8px",
  border: "none",
  borderRadius: 4,
  background: active ? "#0f172a" : "transparent",
  color: active ? "#fff" : "#475569",
  fontWeight: 600,
  cursor: "pointer",
});

export function ExportPreview({ rows }: { rows: ScanRow[] }) {
  const [mode, setMode] = useState<Mode>("brief");
  const [open, setOpen] = useState(false);
  const text = mode === "brief" ? buildTeachingMarkdown(rows) : buildSlideOutline(rows);

  return (
    <div style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
      <div
        style={{
          padding: "10px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.06em]"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#475569",
            fontSize: 11,
          }}
        >
          <span
            style={{
              display: "inline-block",
              transform: open ? "rotate(90deg)" : "none",
              transition: "transform .15s",
              fontSize: 9,
            }}
          >
            ▶
          </span>
          Preview export
        </button>
        {open ? (
          <div
            style={{
              display: "inline-flex",
              gap: 4,
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: 2,
            }}
          >
            <button type="button" onClick={() => setMode("brief")} style={previewTab(mode === "brief")}>
              Brief
            </button>
            <button type="button" onClick={() => setMode("slides")} style={previewTab(mode === "slides")}>
              Slides
            </button>
          </div>
        ) : null}
      </div>
      {open ? (
        <pre
          className="font-mono"
          style={{
            margin: 0,
            padding: "12px 16px",
            maxHeight: 220,
            overflow: "auto",
            fontSize: 11,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            borderTop: "1px solid #e2e8f0",
            background: "#0f172a",
            color: "#cbd5e1",
          }}
        >
          {text}
        </pre>
      ) : null}
    </div>
  );
}
