import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DesktopTrendsClient } from "@/components/DesktopTrendsClient";
import type { ArticleDomain } from "@/lib/types";

export const dynamic = "force-dynamic";

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

type TrendPoint = {
  week: string;
  count: number;
};

type LongTermTrend = {
  tag: string;
  points: TrendPoint[];
  delta: number;
  average: number;
};

function Sparkline({ points }: { points: TrendPoint[] }) {
  const max = Math.max(...points.map((point) => point.count), 1);

  return (
    <div className="mt-3 flex items-end gap-1.5">
      {points.map((point) => (
        <div
          key={point.week}
          className="w-4 rounded-t bg-sky-500/80"
          style={{ height: `${Math.max((point.count / max) * 56, 6)}px` }}
          title={`${point.week}: ${point.count}`}
        />
      ))}
    </div>
  );
}

function TrendSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: LongTermTrend[];
  tone: "up" | "down" | "stable";
}) {
  const toneClass =
    tone === "up"
      ? "text-emerald-700"
      : tone === "down"
        ? "text-rose-700"
        : "text-slate-600";

  return (
    <section className="surface-card p-6">
      <h2 className="section-title">{title}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.tag}
            className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium text-slate-900">#{item.tag}</span>
              <span className={`text-sm font-semibold ${toneClass}`}>
                {item.delta > 0 ? `▲ +${item.delta}` : `▼ ${item.delta}`}
              </span>
            </div>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              Avg {item.average.toFixed(1)} mentions
            </p>
            <Sparkline points={item.points} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams?: Promise<{ domain?: string }>;
}) {
  if (process.env.ELECTRON_RENDERER_MODE === "desktop") {
    return <DesktopTrendsClient />;
  }

  const { analyzeLongTermTrends, hasDatabase } = await import("@/lib/db");
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedDomain = domains.includes(
    (resolvedSearchParams?.domain as ArticleDomain | "All") ?? "All",
  )
    ? ((resolvedSearchParams?.domain as ArticleDomain | "All") ?? "All")
    : "All";
  const trendData = await analyzeLongTermTrends(selectedDomain);

  return (
    <AppShell activePath="/trends">
      <div className="space-y-6">
        <section className="surface-card p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
                Long-Term Trends
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Historical shifts across weeks of stored pattern snapshots
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/patterns" className="tag-pill">
                Weekly patterns
              </Link>
              <Link href="/" className="tag-pill">
                Dashboard
              </Link>
            </div>
          </div>

          <section className="panel-divider">
            <div className="flex flex-wrap items-center gap-2">
              {domains.map((domain) => (
                <Link
                  key={domain}
                  href={domain === "All" ? "/trends" : `/trends?domain=${domain}`}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    selectedDomain === domain
                      ? "bg-sky-600 text-white shadow-sm"
                      : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {domain}
                </Link>
              ))}
            </div>
            {!hasDatabase() ? (
              <p className="mt-3 text-sm text-amber-800">
                `POSTGRES_URL` is not configured locally, so persistent historical trends are not
                available yet.
              </p>
            ) : null}
          </section>
        </section>

        {trendData.available ? (
          <>
            <TrendSection title="Rising Trends" items={trendData.rising} tone="up" />
            <TrendSection title="Declining Trends" items={trendData.declining} tone="down" />
            <TrendSection title="Stable Core Themes" items={trendData.stable} tone="stable" />
          </>
        ) : (
          <section className="surface-muted text-sm text-slate-500">
            Historical trend data will appear here after `POSTGRES_URL` is configured and weekly
            pattern snapshots begin accumulating.
          </section>
        )}
      </div>
    </AppShell>
  );
}
