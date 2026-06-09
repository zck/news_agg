// /Users/montysharma/Projects/news_agg/news_agg/components/scan/ReaderPane.tsx

"use client";

import { Sparkline } from "@/components/Sparkline";
import { DomainChip } from "@/components/scan/DomainChip";
import { ConfidencePill } from "@/components/scan/ConfidencePill";
import { TrendPill } from "@/components/scan/TrendPill";
import { InterestRater } from "@/components/scan/InterestRater";
import { getDomain, type InterestLevel, type ScanRow } from "@/lib/scanViewModel";

type ReaderPaneProps = {
  row: ScanRow | null;
  interest: InterestLevel | null;
  setInterest: (next: InterestLevel | null) => void;
  onClose: () => void;
  onAddTeaching: () => void;
  inTeaching: boolean;
  width?: number;
};

export function ReaderPane({
  row,
  interest,
  setInterest,
  onClose,
  onAddTeaching,
  inTeaching,
  width = 460,
}: ReaderPaneProps) {
  if (!row) {
    return (
      <aside
        style={{
          width,
          flexShrink: 0,
          height: "100vh",
          borderLeft: "1px solid #e2e8f0",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div className="text-center" style={{ color: "#94a3b8", fontSize: 13, maxWidth: 280 }}>
          <div
            className="font-bold uppercase tracking-[0.12em]"
            style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}
          >
            Reader
          </div>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            Click any story to read the synthesis here. Stays open while you scroll the stream.
          </p>
          <div
            style={{
              marginTop: 24,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontSize: 11,
              color: "#94a3b8",
            }}
          >
            <div>
              <kbd className="scan-kbd">j / k</kbd> next / prev
            </div>
            <div>
              <kbd className="scan-kbd">1–4</kbd> rate interest
              <div style={{ paddingLeft: 30, marginTop: 2, opacity: 0.85 }}>
                4 ★ Important · 3 ◆ Interesting · 2 ◐ Later · 1 ✕ Skip
              </div>
            </div>
            <div>
              <kbd className="scan-kbd">t</kbd> add to teaching pack
            </div>
            <div>
              <kbd className="scan-kbd">g</kbd> toggle digest
            </div>
            <div>
              <kbd className="scan-kbd">esc</kbd> clear filter
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const d = getDomain(row.domain);

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        height: "100vh",
        borderLeft: "1px solid #e2e8f0",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          borderBottom: "1px solid #e2e8f0",
          background: d.soft,
        }}
      >
        <div className="flex items-center gap-2.5">
          <DomainChip domain={row.domain} size="sm" />
          <ConfidencePill confidence={row.confidence} />
          <TrendPill delta={row.trendDelta} dir={row.trendDir} />
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onAddTeaching}
            aria-pressed={inTeaching}
            className="scan-icon-btn"
            style={{
              background: inTeaching ? "#0f766e" : "transparent",
              color: inTeaching ? "#fff" : "#475569",
              borderColor: inTeaching ? "#0f766e" : "#cbd5e1",
              fontSize: 11,
              width: "auto",
              padding: "0 10px",
            }}
          >
            {inTeaching ? "✓ Saved" : "+ Teach"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="scan-icon-btn"
            title="Close (esc)"
            aria-label="Close reader"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 32px" }}>
        <div
          className="flex items-baseline gap-3 font-semibold uppercase tracking-[0.1em]"
          style={{ color: "#64748b", fontSize: 11, marginBottom: 8 }}
        >
          <span
            className="font-mono font-bold"
            style={{ color: "#0f172a", fontSize: 13 }}
          >
            Impact {row.impact.toFixed(1)}
          </span>
          <span>·</span>
          <span>
            {row.sourceCount} {row.sourceCount === 1 ? "source" : "sources"}
          </span>
          <span>·</span>
          <span>
            {row.articleCount} {row.articleCount === 1 ? "article" : "articles"}
          </span>
        </div>
        <h2
          className="font-semibold tracking-[-0.01em]"
          style={{
            margin: "4px 0 14px",
            fontSize: 22,
            color: "#020617",
            lineHeight: 1.25,
          }}
        >
          {row.headline}
        </h2>
        {row.summary ? (
          <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.65, color: "#334155" }}>
            {row.summary}
          </p>
        ) : null}

        {/* Why it matters */}
        {row.whyItMatters.length ? (
          <div
            style={{
              padding: "14px 16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              marginBottom: 18,
            }}
          >
            <div
              className="font-bold uppercase tracking-[0.12em]"
              style={{ fontSize: 11, color: "#0f766e", marginBottom: 10 }}
            >
              Why it matters
            </div>
            <ul
              className="m-0 flex list-none flex-col gap-2 p-0"
            >
              {row.whyItMatters.map((b, i) => (
                <li
                  key={i}
                  className="flex gap-2.5"
                  style={{ fontSize: 13, lineHeight: 1.55, color: "#1e293b" }}
                >
                  <span
                    className="font-mono font-bold shrink-0"
                    style={{ color: "#0f766e" }}
                  >
                    —
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Trend mini */}
        <div
          className="flex items-center gap-3.5"
          style={{
            padding: "10px 14px",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            marginBottom: 18,
          }}
        >
          <Sparkline data={row.spark} color={d.color} width={120} height={32} fill strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <div
              className="font-bold uppercase tracking-[0.12em]"
              style={{ fontSize: 10, color: "#64748b" }}
            >
              12-week trend
            </div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 2 }}>
              {row.trendDir === "up" ? "Rising" : row.trendDir === "down" ? "Declining" : "Stable"}
              {" · "}
              <span
                className="font-semibold"
                style={{
                  color:
                    row.trendDir === "up"
                      ? "#047857"
                      : row.trendDir === "down"
                        ? "#be123c"
                        : "#64748b",
                }}
              >
                {row.trendDelta > 0 ? "+" : ""}
                {row.trendDelta}%
              </span>
              {" vs prior 12w"}
            </div>
          </div>
        </div>

        {/* Tags */}
        {row.tags.length ? (
          <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 18 }}>
            {row.tags.map((t) => (
              <span key={t} className="tag-pill" style={{ cursor: "default" }}>
                #{t}
              </span>
            ))}
          </div>
        ) : null}

        {/* Entities */}
        {row.entities.length ? (
          <div style={{ marginBottom: 20 }}>
            <div
              className="font-bold uppercase tracking-[0.12em]"
              style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}
            >
              Entities
            </div>
            <div className="flex flex-wrap gap-1.5">
              {row.entities.map((e) => (
                <span
                  key={`${e.type}:${e.normalized}`}
                  className="font-medium"
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #e2e8f0",
                  }}
                  title={e.type}
                >
                  {e.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Member articles */}
        {row.members.length > 1 ? (
          <div style={{ marginBottom: 20 }}>
            <div
              className="flex justify-between font-bold uppercase tracking-[0.12em]"
              style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}
            >
              <span>Member articles</span>
              <span style={{ color: "#94a3b8" }}>{row.articleCount}</span>
            </div>
            <div
              className="flex flex-col overflow-hidden"
              style={{ border: "1px solid #e2e8f0", borderRadius: 10 }}
            >
              {row.members.map((m, i) => {
                const inner = (
                  <>
                    <span
                      className="font-mono font-semibold shrink-0 truncate"
                      style={{ fontSize: 10, color: "#94a3b8", width: 80 }}
                    >
                      {m.src}
                    </span>
                    <span
                      className="min-w-0 flex-1"
                      style={{ fontSize: 12, color: "#1e293b", lineHeight: 1.4 }}
                    >
                      {m.t}
                    </span>
                    <span
                      className="font-mono shrink-0"
                      style={{ fontSize: 10, color: "#94a3b8" }}
                    >
                      {m.time}
                    </span>
                  </>
                );
                const baseStyle = {
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
                  background: "#fff",
                  textDecoration: "none",
                  color: "inherit",
                };
                return m.url ? (
                  <a
                    key={i}
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:bg-slate-50"
                    style={baseStyle}
                  >
                    {inner}
                  </a>
                ) : (
                  <div key={i} style={baseStyle}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </div>
        ) : row.source || row.url ? (
          <div style={{ marginBottom: 20 }}>
            <div
              className="font-bold uppercase tracking-[0.12em]"
              style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}
            >
              Source
            </div>
            <div
              className="flex items-center gap-2.5"
              style={{
                padding: "9px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <span
                className="font-mono font-semibold"
                style={{ fontSize: 11, color: "#475569", minWidth: 80 }}
              >
                {row.source ?? "—"}
              </span>
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sky-700 hover:underline"
                  style={{ fontSize: 12 }}
                >
                  {row.url}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Interest rating */}
        <div
          style={{
            padding: "14px 16px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
          }}
        >
          <div
            className="font-bold uppercase tracking-[0.12em]"
            style={{ fontSize: 11, color: "#475569", marginBottom: 10 }}
          >
            How interested are you?
          </div>
          <InterestRater value={interest} onChange={setInterest} size="md" showLearningHint />
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.55 }}>
            The system learns from your ratings. Tags and domains you mark <b>Important</b> rise;{" "}
            <b>Skip</b> domains fade.
          </p>
        </div>
      </div>
    </aside>
  );
}
