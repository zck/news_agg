import { CommandCenterClient } from "@/components/CommandCenterClient";
import {
  analyzeLongTermTrends,
  getAffinities,
  getConnections,
  getImplications,
  getLatestArticles,
  getLatestBrief,
  getLatestInsightReport,
  getLatestStoryClusters,
  getNarratives,
  getRules,
  getScenarios,
  getTrends,
  getWatchItems,
  hasDatabase,
} from "@/lib/db";
import { generateNarrativeInsights } from "@/lib/insights";
import { analyzePatterns, computeTrendSignals } from "@/lib/patterns";
import { fallbackArticles } from "@/lib/data";
import { ingestFeeds } from "@/lib/ingest";
import { defaultUserProfile, personalizeStoryCluster } from "@/lib/user";
import { buildNarrativeThreads } from "@/lib/narratives";
import { computeConnections } from "@/lib/connections";
import { generateScenarios } from "@/lib/scenarios";
import { generateImplications } from "@/lib/implications";
import { generateWatchItems } from "@/lib/watch";
import { clusterArticles } from "@/lib/clustering";
import type { WeeklyBrief } from "@/lib/brief";
import type { InsightEngineResult } from "@/lib/insights";
import type { LongTermTrendAnalysis } from "@/lib/db";

export const dynamic = "force-dynamic";

function desktopBootstrapData() {
  const articles = fallbackArticles;
  const patterns = analyzePatterns(articles, "All");
  const now = new Date().toISOString();
  const brief: WeeklyBrief = {
    top_shifts: [
      "Desktop local cache is loading.",
      "Search and dashboard data will hydrate from SQLite after the window opens.",
      "Manual refresh remains available from desktop controls.",
    ],
    emerging_patterns: [
      "Local-first reads are prioritized in desktop mode.",
      "RSS and AI enrichment run through refresh jobs instead of blocking window startup.",
      "Cached articles remain searchable offline.",
    ],
    what_to_watch: [
      "Use Refresh when you want to update local feeds.",
      "Use Search First to query cached articles.",
      "Rebuild the search index from Settings if local search looks stale.",
    ],
    teaching_points: [
      "Desktop bootstrap data is only a startup shell.",
      "SQLite remains the source for local desktop content.",
    ],
    generated_at: now,
    used_fallback: true,
  };
  const longTermTrends: LongTermTrendAnalysis = {
    rising: [],
    declining: [],
    stable: [],
    available: false,
  };
  const insightReport: InsightEngineResult = {
    insights: [],
    inflections: [],
    crossDomainShifts: [],
    narrativeInsights: {
      whatChanged: [],
      emergingTrends: [],
      keyNarratives: [],
      crossDomainInsights: [],
    },
    generatedAt: now,
    usedFallback: true,
  };

  return {
    articles,
    storyClusters: [],
    affinities: [],
    rules: [],
    trendSignals: [],
    narratives: [],
    connections: [],
    scenarios: [],
    implications: [],
    watchItems: [],
    brief,
    patterns,
    longTermTrends,
    insightReport,
    fetchedAt: now,
  };
}

function fallbackBrief(patterns: ReturnType<typeof analyzePatterns>): WeeklyBrief {
  const leader = patterns.topTags[0]?.tag?.replace(/_/g, " ") ?? "tech coverage";
  const trend = patterns.trendingUp.find((entry) => entry.delta > 0)?.tag?.replace(/_/g, " ");
  const now = new Date().toISOString();

  return {
    top_shifts: [
      `${leader} is the strongest stored signal in the current article cache.`,
      trend
        ? `${trend} is showing the clearest increase versus the previous window.`
        : "The cached weekly mix is stable, with no single tag breaking away sharply.",
      "The dashboard is reading cached intelligence snapshots instead of running ingestion during page render.",
    ],
    emerging_patterns: [
      trend
        ? `${trend} is gaining visibility across recent cached reporting.`
        : "Recurring themes are present, but the cache needs more history for stronger movement signals.",
      "Stored trend and cluster snapshots are used when available.",
      "Manual or scheduled ingestion can update the cache outside the dashboard request path.",
    ],
    what_to_watch: [
      "Watch whether rising tags continue to accumulate in the next refresh cycle.",
      "Review high-impact clusters for repeated source reinforcement.",
      "Check long-term trends once multiple stored pattern snapshots exist.",
    ],
    teaching_points: [
      "Cached snapshots keep the dashboard responsive under concurrent traffic.",
      "Directional change should be generated outside the request path and reused by readers.",
    ],
    generated_at: now,
    used_fallback: true,
  };
}

async function liveRssDashboardData() {
  const payload = await ingestFeeds({ fast: true });
  const articles = payload.articles;
  const storyClusters = payload.storyClusters ?? payload.clusters ?? clusterArticles(articles);
  const patterns = analyzePatterns(articles, "All");
  const trendSignals = computeTrendSignals(patterns);
  const narratives = buildNarrativeThreads(storyClusters);
  const connections = computeConnections(storyClusters);
  const scenarios = generateScenarios({ trends: trendSignals, narratives, connections });
  const implications = scenarios.map(generateImplications);
  const watchItems = scenarios.map(generateWatchItems);
  const narrativeInsights = generateNarrativeInsights({
    trends: trendSignals,
    narratives,
    connections,
  });

  return {
    articles,
    storyClusters,
    affinities: [],
    rules: [],
    trendSignals,
    narratives,
    connections,
    scenarios,
    implications,
    watchItems,
    brief: fallbackBrief(patterns),
    patterns,
    longTermTrends: {
      rising: [],
      declining: [],
      stable: [],
      available: false,
    } satisfies LongTermTrendAnalysis,
    insightReport: {
      insights: [],
      inflections: [],
      crossDomainShifts: [],
      narrativeInsights,
      generatedAt: payload.fetchedAt,
      usedFallback: true,
    } satisfies InsightEngineResult,
    fetchedAt: payload.fetchedAt,
  };
}

async function cachedDashboardData() {
  if (!hasDatabase()) {
    try {
      return await liveRssDashboardData();
    } catch (error) {
      console.warn(
        `[dashboard] live RSS read failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return desktopBootstrapData();
    }
  }

  try {
    const [
      cachedArticles,
      storedClusters,
      affinities,
      rules,
      storedTrendSignals,
      storedNarratives,
      storedConnections,
      storedScenarios,
      storedImplications,
      storedWatchItems,
      storedBrief,
      storedInsightReport,
      longTermTrends,
    ] = await Promise.all([
      getLatestArticles("All", 120),
      getLatestStoryClusters("All", 40),
      getAffinities(),
      getRules(),
      getTrends(12),
      getNarratives(12),
      getConnections(15),
      getScenarios(10),
      getImplications(10),
      getWatchItems(10),
      getLatestBrief(),
      getLatestInsightReport(),
      analyzeLongTermTrends("All"),
    ]);

    if (!cachedArticles.length) {
      return liveRssDashboardData();
    }

    const baseClusters = storedClusters.length
      ? storedClusters
      : clusterArticles(cachedArticles);
    const personalizedStoryClusters = baseClusters
      .flatMap((cluster) => {
        const personalized = personalizeStoryCluster(cluster, defaultUserProfile, affinities, rules);
        return personalized ? [personalized] : [];
      })
      .sort(
        (left, right) =>
          (right.adaptiveScore ?? right.impactScore) - (left.adaptiveScore ?? left.impactScore),
      );
    const patterns = analyzePatterns(cachedArticles, "All");
    const trendSignals = storedTrendSignals.length
      ? storedTrendSignals
      : computeTrendSignals(patterns);
    const narratives = storedNarratives.length
      ? storedNarratives
      : buildNarrativeThreads(personalizedStoryClusters);
    const connections = storedConnections.length
      ? storedConnections
      : computeConnections(personalizedStoryClusters);
    const scenarios = storedScenarios.length
      ? storedScenarios
      : generateScenarios({ trends: trendSignals, narratives, connections });
    const implications = storedImplications.length
      ? storedImplications
      : scenarios.map(generateImplications);
    const watchItems = storedWatchItems.length
      ? storedWatchItems
      : scenarios.map(generateWatchItems);
    const narrativeInsights = generateNarrativeInsights({
      trends: trendSignals,
      narratives,
      connections,
    });
    const insightReport = storedInsightReport
      ? { ...storedInsightReport, narrativeInsights }
      : {
          insights: [],
          inflections: [],
          crossDomainShifts: [],
          narrativeInsights,
          generatedAt: new Date().toISOString(),
          usedFallback: true,
        } satisfies InsightEngineResult;

    return {
      articles: cachedArticles,
      storyClusters: personalizedStoryClusters,
      affinities,
      rules,
      trendSignals,
      narratives,
      connections,
      scenarios,
      implications,
      watchItems,
      brief: storedBrief ?? fallbackBrief(patterns),
      patterns,
      longTermTrends,
      insightReport,
      fetchedAt: cachedArticles[0]?.processed_at ?? new Date().toISOString(),
    };
  } catch (error) {
    console.warn(
      `[dashboard] cached dashboard read failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return desktopBootstrapData();
  }
}

export default async function DashboardPage() {
  const dashboardData = await cachedDashboardData();

  return (
    <CommandCenterClient
      {...dashboardData}
    />
  );
}
