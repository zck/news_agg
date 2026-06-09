"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import type { PatternAnalysis } from "@/lib/patterns";
import type { ArticleDomain } from "@/lib/types";

const domains: Array<ArticleDomain | "All"> = [
  "All",
  "AIUse",
  "LLM",
  "AIInfra",
  "Semis",
  "Cloud",
  "Security",
  "Consumer",
  "Bio",
  "Climate",
  "Crypto",
  "Policy",
  "Space",
  "Robotics",
  "Batteries",
  "AR",
  "Materials",
  "General",
];

function deltaColor(delta: number) {
  if (delta > 0) {
    return "text-emerald-700";
  }

  if (delta < 0) {
    return "text-rose-700";
  }

  return "text-slate-500";
}

function deltaLabel(delta: number) {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function emptyAnalysis(domain: ArticleDomain | "All"): PatternAnalysis {
  return {
    domain,
    topTags: [],
    trendingUp: [],
    correlations: [],
    insights: [],
    generatedAt: new Date().toISOString(),
  };
}

export function DesktopPatternsClient() {
  const [selectedDomain, setSelectedDomain] = useState<ArticleDomain | "All">("All");
  const [analysis, setAnalysis] = useState<PatternAnalysis>(() => emptyAnalysis("All"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPatterns() {
      setLoading(true);
      setError(null);

      try {
        const result = await window.desktop?.data.getPatterns({
          domain: selectedDomain === "All" ? undefined : selectedDomain,
          limit: 500,
        });

        if (!cancelled) {
          setAnalysis((result as PatternAnalysis | undefined) ?? emptyAnalysis(selectedDomain));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load patterns");
          setAnalysis(emptyAnalysis(selectedDomain));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPatterns();

    return () => {
      cancelled = true;
    };
  }, [selectedDomain]);

  const maxTagCount = analysis.topTags[0]?.count ?? 1;
  const maxCorrelationCount = analysis.correlations[0]?.count ?? 1;

  return (
    <AppShell activePath="/patterns">
      <div className="space-y-6">
        <section className="surface-card p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
                Pattern View
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Weekly pattern signals across tagged tech coverage
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className="tag-pill">
                Dashboard
              </Link>
              <Link href="/brief" className="tag-pill">
                Weekly brief
              </Link>
              <Link href="/trends" className="tag-pill">
                Long-term trends
              </Link>
            </div>
          </div>

          <section className="panel-divider">
            <div className="flex flex-wrap items-center gap-2">
              {domains.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  onClick={() => setSelectedDomain(domain)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    selectedDomain === domain
                      ? "bg-sky-600 text-white shadow-sm"
                      : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {domain}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {loading
                ? "Loading local patterns..."
                : `Updated ${new Date(analysis.generatedAt).toLocaleString()} for ${
                    selectedDomain === "All" ? "all domains" : selectedDomain
                  }.`}
            </p>
            {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
          </section>
        </section>

        <section className="surface-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Top Tags This Week</h2>
            <span className="text-sm text-slate-500">Last 7 days</span>
          </div>
          <div className="mt-4 space-y-3">
            {analysis.topTags.length ? (
              analysis.topTags.map((entry) => (
                <div
                  key={entry.tag}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-slate-900">#{entry.tag}</span>
                    <span className="text-sm text-slate-500">{entry.count} mentions</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-sky-600"
                      style={{ width: `${(entry.count / maxTagCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="surface-muted text-sm text-slate-500">
                Local pattern data will appear after a refresh stores articles.
              </div>
            )}
          </div>
        </section>

        <section className="surface-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Trending Up</h2>
            <span className="text-sm text-slate-500">Current vs previous week</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {analysis.trendingUp.map((entry) => (
              <div
                key={entry.tag}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
              >
                <div>
                  <div className="font-medium text-slate-900">#{entry.tag}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                    {entry.signal}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${deltaColor(entry.delta)}`}>
                    {entry.delta >= 0 ? "▲ " : "▼ "}
                    {deltaLabel(entry.delta)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {entry.current} vs {entry.previous}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-6">
          <h2 className="section-title">Correlations</h2>
          <div className="mt-4 space-y-3">
            {analysis.correlations.map((entry) => (
              <div
                key={entry.pair.join("-")}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium text-slate-900">
                    #{entry.pair[0]} + #{entry.pair[1]}
                  </span>
                  <span className="text-sm text-slate-500">{entry.count} pairings</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${(entry.count / maxCorrelationCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-6">
          <h2 className="section-title">Insights</h2>
          <div className="mt-4 space-y-3">
            {analysis.insights.map((insight) => (
              <p
                key={insight}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-600 shadow-sm"
              >
                {insight}
              </p>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
