// /Users/montysharma/Projects/news_agg/news_agg/components/scan/SectorRail.tsx

"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { ArticleDomain } from "@/lib/types";
import { ARTICLE_DOMAINS } from "@/lib/types";
import { getDomain } from "@/lib/scanViewModel";

type DomainStat = { count: number; deltaSum: number; n: number };

type SectorRailProps = {
  totalCount: number;
  activeDomain: ArticleDomain | "All";
  onDomainChange: (next: ArticleDomain | "All") => void;
  domainStats: Record<ArticleDomain, DomainStat>;
  counts: { important: number; interesting: number; later: number; skip: number; unrated: number };
  teachingCount: number;
  onOpenTeaching: () => void;
};

const railBtn: CSSProperties = {
  width: "100%",
  padding: "8px 14px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "#cbd5e1",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
  textAlign: "left",
  transition: "background .12s",
};

const countBadge: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "#64748b",
  background: "rgba(148,163,184,0.1)",
  padding: "1px 6px",
  borderRadius: 4,
  fontWeight: 600,
};

const HUB_LINKS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Hub" },
  { href: "/trends", label: "Trends" },
  { href: "/patterns", label: "Patterns" },
  { href: "/brief", label: "Brief" },
];

export function SectorRail({
  totalCount,
  activeDomain,
  onDomainChange,
  domainStats,
  counts,
  teachingCount,
  onOpenTeaching,
}: SectorRailProps) {
  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        background: "#020617",
        color: "#cbd5e1",
        borderRight: "1px solid #1e293b",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b" }}>
        <div
          className="font-bold uppercase tracking-[0.18em]"
          style={{ fontSize: 10, color: "#38bdf8" }}
        >
          Tech Cmd
        </div>
        <div className="font-semibold" style={{ fontSize: 14, color: "#fff", marginTop: 2 }}>
          Scan · Terminal
        </div>
        <div
          className="font-mono"
          style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}
        >
          {totalCount} clusters · live
        </div>
      </div>

      {/* Sector list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        <button
          type="button"
          onClick={() => onDomainChange("All")}
          style={{
            ...railBtn,
            background: activeDomain === "All" ? "#0f172a" : "transparent",
            color: activeDomain === "All" ? "#38bdf8" : "#cbd5e1",
            borderLeft:
              activeDomain === "All" ? "2px solid #38bdf8" : "2px solid transparent",
          }}
        >
          <span>ALL DOMAINS</span>
          <span
            style={{
              ...countBadge,
              color: activeDomain === "All" ? "#38bdf8" : "#64748b",
            }}
          >
            {totalCount}
          </span>
        </button>

        {ARTICLE_DOMAINS.map((id) => {
          const s = domainStats[id];
          if (!s || s.count === 0) return null;
          const d = getDomain(id);
          const avgDelta = s.n > 0 ? Math.round(s.deltaSum / s.n) : 0;
          const active = activeDomain === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onDomainChange(id)}
              style={{
                ...railBtn,
                background: active ? "#0f172a" : "transparent",
                borderLeft: active ? `2px solid ${d.color}` : "2px solid transparent",
              }}
            >
              <span
                className="inline-flex min-w-0 items-center gap-2"
                style={{ overflow: "hidden" }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: d.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="overflow-hidden text-ellipsis"
                  style={{
                    color: active ? "#fff" : "#cbd5e1",
                    fontWeight: active ? 600 : 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.label}
                </span>
              </span>
              <span
                className="inline-flex items-center gap-1.5 font-mono"
                style={{ fontSize: 10 }}
              >
                <span
                  className="font-bold"
                  style={{
                    color: avgDelta > 0 ? "#34d399" : avgDelta < 0 ? "#fb7185" : "#64748b",
                  }}
                >
                  {avgDelta > 0 ? "+" : ""}
                  {avgDelta}
                </span>
                <span style={countBadge}>{s.count}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Interest tally */}
      <div
        className="font-mono"
        style={{
          padding: "10px 14px",
          borderTop: "1px solid #1e293b",
          fontSize: 10,
          color: "#64748b",
        }}
      >
        <div
          className="flex items-baseline justify-between font-bold uppercase tracking-[0.14em]"
          style={{
            fontSize: 9,
            color: "#475569",
            marginBottom: 6,
            fontFamily: "var(--font-sans)",
          }}
        >
          <span>Your taste</span>
          <span
            className="font-mono"
            style={{ fontSize: 9, color: "#475569", letterSpacing: "0.04em" }}
            title="Press 1–4 to rate the selected story"
          >
            4★ 3◆ 2◐ 1✕
          </span>
        </div>
        <Tally label="★ Important" value={counts.important} color="#38bdf8" />
        <Tally label="◆ Interesting" value={counts.interesting} color="#5eead4" />
        <Tally label="◐ Later" value={counts.later} color="#fbbf24" />
        <Tally label="✕ Skip" value={counts.skip} color="#fb7185" />
      </div>

      {/* Teaching button */}
      <button
        type="button"
        onClick={onOpenTeaching}
        className="font-semibold"
        style={{
          margin: 12,
          padding: "10px 12px",
          background: "#0f766e",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 12,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>📚 Teaching Pack</span>
        <span
          className="font-mono"
          style={{
            background: "rgba(255,255,255,0.18)",
            padding: "1px 7px",
            borderRadius: 999,
            fontSize: 11,
          }}
        >
          {teachingCount}
        </span>
      </button>

      {/* Hub footer — nav back to other tabs since we replace the AppShell */}
      <div
        style={{
          borderTop: "1px solid #1e293b",
          padding: "8px 12px 12px",
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {HUB_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="font-medium"
            style={{
              fontSize: 11,
              color: "#94a3b8",
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #1e293b",
              background: "rgba(148,163,184,0.04)",
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}

function Tally({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex justify-between" style={{ padding: "2px 0" }}>
      <span>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}
