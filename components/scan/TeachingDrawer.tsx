// /Users/montysharma/Projects/news_agg/news_agg/components/scan/TeachingDrawer.tsx

"use client";

import { useMemo } from "react";
import { DomainChip } from "@/components/scan/DomainChip";
import { ExportPreview } from "@/components/scan/ExportPreview";
import {
  buildSlideOutline,
  buildTeachingMarkdown,
  downloadText,
  teachingFilename,
} from "@/lib/scanExport";
import type { ScanRow } from "@/lib/scanViewModel";

type TeachingDrawerProps = {
  open: boolean;
  onClose: () => void;
  itemIds: string[];
  rows: ScanRow[];
  onRemove: (id: string) => void;
};

export function TeachingDrawer({ open, onClose, itemIds, rows, onRemove }: TeachingDrawerProps) {
  const sel = useMemo(() => {
    const map = new Map(rows.map((r) => [r.id, r]));
    return itemIds.map((id) => map.get(id)).filter((r): r is ScanRow => Boolean(r));
  }, [rows, itemIds]);

  return (
    <aside
      aria-label="Teaching pack"
      aria-hidden={!open}
      inert={!open}
      style={{
        position: "fixed",
        right: open ? 0 : -440,
        top: 0,
        bottom: 0,
        width: 420,
        background: "#fff",
        borderLeft: "1px solid #e2e8f0",
        boxShadow: "0 14px 30px rgba(15,23,42,0.07)",
        transition: "right .25s ease",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            className="font-bold uppercase tracking-[0.12em]"
            style={{ fontSize: 11, color: "#0f766e" }}
          >
            Teaching Pack
          </div>
          <div className="font-semibold" style={{ fontSize: 18, color: "#020617", marginTop: 2 }}>
            {sel.length} {sel.length === 1 ? "story" : "stories"}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close teaching pack"
          onClick={onClose}
          className="scan-icon-btn"
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {sel.length === 0 ? (
          <div
            className="text-center"
            style={{ color: "#94a3b8", fontSize: 13, padding: 32, lineHeight: 1.6 }}
          >
            No stories yet. Hit <kbd className="scan-kbd">t</kbd> on any story to add it. Then export as
            a markdown brief or slide outline for class.
          </div>
        ) : (
          sel.map((r) => (
            <div
              key={r.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "10px 12px",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <DomainChip domain={r.domain} size="xs" />
                <button
                  type="button"
                  aria-label={`Remove ${r.headline} from teaching pack`}
                  onClick={() => onRemove(r.id)}
                  className="font-semibold hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:rounded"
                  style={{
                    fontSize: 10,
                    color: "#94a3b8",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </div>
              <div
                className="font-semibold"
                style={{ fontSize: 13, color: "#020617", lineHeight: 1.35 }}
              >
                {r.headline}
              </div>
            </div>
          ))
        )}
      </div>

      {sel.length > 0 ? (
        <>
          <ExportPreview rows={sel} />
          <div
            style={{
              padding: 14,
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() =>
                downloadText(teachingFilename("teaching-pack"), buildTeachingMarkdown(sel))
              }
              className="font-semibold hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              style={{
                flex: 1,
                padding: "10px 14px",
                background: "#0f766e",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ↓ Markdown brief
            </button>
            <button
              type="button"
              onClick={() =>
                downloadText(teachingFilename("slide-outline"), buildSlideOutline(sel))
              }
              className="font-semibold hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              style={{
                flex: 1,
                padding: "10px 14px",
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ↓ Slide outline
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}
