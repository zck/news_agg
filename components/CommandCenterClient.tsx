"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearImportanceFeedback,
  clearLearningProfile,
  getEffectiveImportance,
  loadImportanceFeedback,
  loadLearningProfile,
  rebuildLearningProfile,
  resetUserImportance,
  saveLearningProfile,
  setUserImportance,
  type ImportanceLearningProfile,
} from "@/lib/feedback";
import { updateAffinitiesFromFeedback } from "@/lib/affinity";
import { AppShell } from "@/components/AppShell";
import { DesktopControls } from "@/components/DesktopControls";
import { ArticleFeed } from "@/components/ArticleFeed";
import { DomainBreadthView } from "@/components/DomainBreadthView";
import { FiltersBar } from "@/components/FiltersBar";
import { KPIStrip, type KPITile } from "@/components/KPIStrip";
import { MegaStoryStrip } from "@/components/MegaStoryStrip";
import { OutputGenerationPanel } from "@/components/OutputGenerationPanel";
import { RecallActionBar } from "@/components/RecallActionBar";
import { SearchCommandPanel } from "@/components/SearchCommandPanel";
import {
  RECALL_IMPORT_URL,
  buildBookmarksHtml,
  buildExportFilename,
} from "@/lib/recall";
import { extractEntities, mergeEntities } from "@/lib/entities";
import { buildNarrativeThreads } from "@/lib/narratives";
import { computeConnections } from "@/lib/connections";
import { generateScenarios } from "@/lib/scenarios";
import { generateImplications } from "@/lib/implications";
import { generateWatchItems } from "@/lib/watch";
import type {
  Article,
  ArticleDomain,
  ConnectionStrength,
  ImportanceFeedback,
  NarrativeInsightReport,
  NarrativeThread,
  PersonalizationRule,
  Scenario,
  ScenarioImplication,
  StoryCluster,
  TrendSignal,
  UserAffinity,
  UserFeedbackAction,
  WatchItem,
} from "@/lib/types";
import type { WeeklyBrief } from "@/lib/brief";
import type { PatternAnalysis } from "@/lib/patterns";
import type { LongTermTrendAnalysis } from "@/lib/db";
import type { InsightEngineResult } from "@/lib/insights";
import {
  articleHasExcludedTag,
  defaultUserProfile,
  loadUserProfile,
  saveUserProfile,
  scoreArticle,
  personalizeStoryCluster,
  type UserProfile,
} from "@/lib/user";
import {
  deriveThreadsFromClusters,
  EMPTY_MEMORY_STATE,
  reconcileThreads,
  type MemoryState,
} from "@/lib/memory";

const WeeklyShifts = dynamic(
  () => import("@/components/WeeklyShifts").then((mod) => mod.WeeklyShifts),
  {
    loading: () => <div className="surface-card h-56 animate-pulse bg-slate-100 p-6" />,
  },
);
const KeyInsights = dynamic(
  () => import("@/components/KeyInsights").then((mod) => mod.KeyInsights),
  {
    loading: () => <div className="surface-card h-56 animate-pulse bg-slate-100 p-6" />,
  },
);
const TrendsPanel = dynamic(
  () => import("@/components/TrendsPanel").then((mod) => mod.TrendsPanel),
  {
    loading: () => <div className="surface-card h-80 animate-pulse bg-slate-100 p-6" />,
  },
);

const DESKTOP_ARTICLE_LIMIT = 500;
const CLUSTER_INPUT_LIMIT = 120;
const MEGA_STORY_LIMIT = 3;

type CommandCenterClientProps = {
  articles: Article[];
  storyClusters?: StoryCluster[];
  clusters?: StoryCluster[];
  affinities?: UserAffinity[];
  rules?: PersonalizationRule[];
  trendSignals?: TrendSignal[];
  narratives?: NarrativeThread[];
  connections?: ConnectionStrength[];
  scenarios?: Scenario[];
  implications?: ScenarioImplication[];
  watchItems?: WatchItem[];
  brief: WeeklyBrief;
  patterns: PatternAnalysis;
  longTermTrends: LongTermTrendAnalysis;
  insightReport: InsightEngineResult;
  fetchedAt: string;
};

function inferRelatedTag(text: string, tags: string[]) {
  const normalized = text.toLowerCase();
  return (
    tags.find((tag) => normalized.includes(tag.replace(/_/g, " "))) ??
    tags.find((tag) => normalized.includes(tag))
  );
}

function withinRange(article: Article, range: "today" | "week" | "month") {
  if (!article.date) {
    return true;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const endOfDay = new Date(article.date).getTime() + dayMs;

  if (Number.isNaN(endOfDay)) {
    return true;
  }

  const age = Date.now() - endOfDay;

  if (age <= 0) {
    return true;
  }

  if (range === "today") {
    return age <= dayMs;
  }

  if (range === "week") {
    return age <= 7 * dayMs;
  }

  return age <= 30 * dayMs;
}

const CLIENT_STOP_WORDS = new Set([
  "about",
  "after",
  "amid",
  "from",
  "into",
  "over",
  "says",
  "that",
  "this",
  "with",
  "will",
]);

const CLIENT_STRATEGIC_TAGS = new Set([
  "ai_infrastructure",
  "chips",
  "energy_constraint",
  "data_centers",
  "frontier_models",
  "security",
  "regulation",
  "inference",
  "gpu",
  "cloud",
]);

function stableClientSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function clientTokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !CLIENT_STOP_WORDS.has(token));
}

function articleTopicTerms(article: Article) {
  return new Set(clientTokens(`${article.headline} ${article.summary} ${article.tags.join(" ")}`));
}

function overlapsCluster(article: Article, group: Article[]) {
  const articleTerms = articleTopicTerms(article);
  const articleTags = new Set(article.tags);

  return group.some((candidate) => {
    if (article.url && candidate.url && article.url === candidate.url) {
      return true;
    }

    const sharedTags = candidate.tags.filter((tag) => articleTags.has(tag)).length;
    if (article.domain === candidate.domain && sharedTags > 0) {
      return true;
    }

    const candidateTerms = articleTopicTerms(candidate);
    const sharedTerms = [...articleTerms].filter((term) => candidateTerms.has(term)).length;
    return sharedTerms >= 3;
  });
}

function clientConfidence(sourceCount: number): StoryCluster["confidence"] {
  if (sourceCount >= 3) return "high";
  if (sourceCount === 2) return "medium";
  return "low";
}

function clientImpactScore(articles: Article[], sources: string[], tags: string[]) {
  const newestTime = Math.max(
    ...articles.map((article) => new Date(article.processed_at || article.date).getTime()),
  );
  const ageHours = (Date.now() - newestTime) / (60 * 60 * 1000);
  const recency = ageHours <= 12 ? 2 : ageHours <= 48 ? 1.5 : ageHours <= 168 ? 1 : 0.5;
  const maxImportance = Math.max(...articles.map((article) => article.importance));
  const tagBoost = Math.min(
    tags.filter((tag) => CLIENT_STRATEGIC_TAGS.has(tag)).length * 0.5,
    1.5,
  );

  return Number(Math.max(1, Math.min(10, sources.length * 2 + recency + maxImportance * 0.6 + tagBoost)).toFixed(1));
}

function clientWhyItMatters(tags: string[], domain: string, sourceCount: number) {
  const leadTag = tags[0]?.replace(/_/g, " ") ?? "this signal";
  const sourceText =
    sourceCount > 1
      ? `${sourceCount} sources are reinforcing the story`
      : "one source is reporting the story";

  return [
    `${sourceText}, making ${leadTag} worth tracking in ${domain}.`,
    `The technical implication centers on execution constraints around ${leadTag}.`,
    "Future direction: watch for follow-on reporting, customer adoption, regulation, or supply-chain effects.",
  ];
}

function buildClientClusters(articles: Article[]) {
  const groups: Article[][] = [];
  const sortedArticles = articles.slice(0, CLUSTER_INPUT_LIMIT).sort(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime() ||
      right.importance - left.importance,
  );

  for (const article of sortedArticles) {
    const group = groups.find((candidateGroup) => overlapsCluster(article, candidateGroup));

    if (group) {
      group.push(article);
    } else {
      groups.push([article]);
    }
  }

  return groups
    .map((group) => {
      const ranked = [...group].sort(
        (left, right) =>
          right.importance - left.importance ||
          new Date(right.date).getTime() - new Date(left.date).getTime(),
      );
      const lead = ranked[0];
      const sources = uniqueStrings(group.map((article) => article.source));
      const tags = uniqueStrings(group.flatMap((article) => article.tags)).slice(0, 8);
      const entities = mergeEntities(group.map((article) => extractEntities(article))).slice(0, 12);
      const updatedAt = new Date(
        Math.max(
          ...group.map((article) => new Date(article.processed_at || article.date).getTime()),
        ),
      ).toISOString();
      const firstSeenAt = new Date(
        Math.min(
          ...group.map((article) => new Date(article.processed_at || article.date).getTime()),
        ),
      ).toISOString();

      return {
        id: `cluster-${stableClientSlug(lead.headline || lead.id)}`,
        headline: lead.headline,
        summary:
          group.length > 1
            ? `${lead.summary} Tracked across ${group.length} articles from ${sources.length} sources.`
            : lead.summary,
        whyItMatters: clientWhyItMatters(tags, lead.domain, sources.length),
        domain: lead.domain,
        tags,
        entities,
        articleIds: ranked.map((article) => article.id),
        sources,
        sourceCount: sources.length,
        confidence: clientConfidence(sources.length),
        impactScore: clientImpactScore(group, sources, tags),
        firstSeenAt,
        lastSeenAt: updatedAt,
      } satisfies StoryCluster;
    })
    .sort((left, right) => right.impactScore - left.impactScore);
}

export function CommandCenterClient({
  articles: initialArticles,
  storyClusters: initialStoryClusters,
  clusters: initialClusters,
  affinities: initialAffinities = [],
  rules: initialRules = [],
  trendSignals: initialTrendSignals = [],
  narratives: initialNarratives = [],
  connections: initialConnections = [],
  scenarios: initialScenarios = [],
  implications: initialImplications = [],
  watchItems: initialWatchItems = [],
  brief: initialBrief,
  patterns: initialPatterns,
  longTermTrends: initialLongTermTrends,
  insightReport: initialInsightReport,
  fetchedAt: initialFetchedAt,
}: CommandCenterClientProps) {
  const initialClusterData = initialStoryClusters?.length ? initialStoryClusters : initialClusters;
  const [articles, setArticles] = useState(initialArticles);
  const [clusters, setClusters] = useState<StoryCluster[]>(
    initialClusterData?.length ? initialClusterData : buildClientClusters(initialArticles),
  );
  const [brief, setBrief] = useState(initialBrief);
  const [patterns, setPatterns] = useState(initialPatterns);
  const [longTermTrends, setLongTermTrends] = useState(initialLongTermTrends);
  const [insightReport, setInsightReport] = useState(initialInsightReport);
  const [fetchedAt, setFetchedAt] = useState(initialFetchedAt);
  const [refreshStatus, setRefreshStatus] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month">("week");
  const [activeDomain, setActiveDomain] = useState<"All" | ArticleDomain>("All");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [personalizedView, setPersonalizedView] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(defaultUserProfile);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, ImportanceFeedback>>({});
  const [affinities, setAffinities] = useState<UserAffinity[]>(initialAffinities);
  const [rules, setRules] = useState<PersonalizationRule[]>(initialRules);
  const [learningProfile, setLearningProfile] =
    useState<ImportanceLearningProfile>(loadLearningProfile);
  const [memoryState, setMemoryState] = useState<MemoryState>(EMPTY_MEMORY_STATE);
  const [selectedRecallIds, setSelectedRecallIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [recallNotice, setRecallNotice] = useState<string | null>(null);

  const loadDesktopData = useCallback(async () => {
    if (!window.desktop) {
      return;
    }

    setRefreshStatus("Reading local cache");
    const settled = await Promise.allSettled([
      window.desktop.data.getArticles({ limit: DESKTOP_ARTICLE_LIMIT }),
      window.desktop.data.getPatterns({ limit: 500 }),
      window.desktop.data.getBrief(),
      window.desktop.data.getInsights(),
      window.desktop.data.getLongTermTrends({ weeks: 12 }),
      window.desktop.data.getImportanceFeedback(),
      window.desktop.data.getAffinities(),
      window.desktop.data.getRules(),
      window.desktop.jobs.getLastRefresh(),
      window.desktop.data.getPreferences(),
      window.desktop.memory?.getState() ?? Promise.resolve(EMPTY_MEMORY_STATE),
    ]);

    const pick = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === "fulfilled" ? result.value : fallback;

    const localArticles = pick(settled[0] as PromiseSettledResult<Article[]>, [] as Article[]);
    if (settled[0].status === "rejected") {
      console.warn("[desktop] getArticles failed", settled[0].reason);
      setRefreshStatus("Local cache unavailable");
      return;
    }

    setArticles(localArticles);
    setClusters([]);
    setRefreshStatus("Clustering local stories");
    window.setTimeout(() => {
      setClusters(buildClientClusters(localArticles));
    }, 0);

    const localPatterns = settled[1].status === "fulfilled" ? settled[1].value : null;
    if (localPatterns) {
      setPatterns(localPatterns);
    }

    const localBrief = settled[2].status === "fulfilled" ? settled[2].value : null;
    if (localBrief) {
      setBrief(localBrief);
    }

    const localInsights = settled[3].status === "fulfilled" ? settled[3].value : null;
    if (localInsights && localInsights.insights.length) {
      setInsightReport(localInsights);
    }

    const localLongTermTrends = settled[4].status === "fulfilled" ? settled[4].value : null;
    if (localLongTermTrends && localLongTermTrends.available) {
      setLongTermTrends(localLongTermTrends);
    }

    const localFeedback = pick(
      settled[5] as PromiseSettledResult<Record<string, ImportanceFeedback>>,
      {} as Record<string, ImportanceFeedback>,
    );
    setFeedbackMap(localFeedback);

    setAffinities(pick(settled[6] as PromiseSettledResult<UserAffinity[]>, []));
    setRules(pick(settled[7] as PromiseSettledResult<PersonalizationRule[]>, []));

    const lastRefresh = settled[8].status === "fulfilled" ? settled[8].value : null;

    const learned = rebuildLearningProfile(localArticles, localFeedback);
    setLearningProfile(learned);
    saveLearningProfile(learned);
    setFetchedAt(lastRefresh ?? localArticles[0]?.processed_at ?? initialFetchedAt);

    const preferences = settled[9].status === "fulfilled" ? settled[9].value : null;
    if (preferences) {
      setPersonalizedView(preferences.personalizedDefault);
      setRefreshStatus(
        preferences.lastRefreshError
          ? "Cached data"
          : lastRefresh
            ? "Local cache"
            : "Local cache empty",
      );
    } else {
      setRefreshStatus(lastRefresh ? "Local cache" : "Local cache empty");
    }

    const memoryResult = settled[10]?.status === "fulfilled" ? settled[10].value : null;
    if (memoryResult && !memoryResult.error) {
      setMemoryState({
        clusterViewStates: memoryResult.clusterViewStates ?? {},
        domainViewStates: memoryResult.domainViewStates ?? {},
        threads: memoryResult.threads ?? [],
        latestSnapshots: memoryResult.latestSnapshots ?? {},
      });
    }
  }, [initialFetchedAt]);

  useEffect(() => {
    if (window.desktop) {
      void window.desktop.data.getImportanceFeedback().then((storedFeedback) => {
        const learned = rebuildLearningProfile(articles, storedFeedback);
        setFeedbackMap(storedFeedback);
        setLearningProfile(learned);
        saveLearningProfile(learned);
      });
      return;
    }

    setProfile(loadUserProfile());
    const storedFeedback = loadImportanceFeedback();
    const learned = rebuildLearningProfile(articles, storedFeedback);
    setFeedbackMap(storedFeedback);
    setLearningProfile(learned);
    saveLearningProfile(learned);
  }, [articles]);

  useEffect(() => {
    void loadDesktopData();
  }, [loadDesktopData]);

  useEffect(() => {
    saveUserProfile(profile);
  }, [profile]);

  const availableTags = useMemo(
    () => Array.from(new Set(articles.flatMap((article) => article.tags))).sort(),
    [articles],
  );
  const availableDomains = useMemo(
    () => Array.from(new Set(articles.map((article) => article.domain))).sort(),
    [articles],
  );

  const scoreLookup = useMemo(() => {
    return new Map(
      articles.map((article) => [
        article.id,
        scoreArticle(article, profile, feedbackMap, learningProfile),
      ]),
    );
  }, [articles, feedbackMap, learningProfile, profile]);
  const articleLookup = useMemo(
    () => new Map(articles.map((article) => [article.id, article])),
    [articles],
  );

  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      const matchesTime = withinRange(article, timeRange);
      const matchesDomain = activeDomain === "All" || article.domain === activeDomain;
      const matchesTags =
        activeTags.length === 0 ||
        activeTags.every((tag) => article.tags.includes(tag));

      const excluded =
        personalizedView && articleHasExcludedTag(article, profile);

      return matchesTime && matchesDomain && matchesTags && !excluded;
    });
  }, [activeDomain, activeTags, articles, personalizedView, profile, timeRange]);

  const filteredClusters = useMemo(() => {
    const sourceClusters = personalizedView
      ? clusters.flatMap((cluster) => {
          const personalized = personalizeStoryCluster(cluster, profile, affinities, rules);
          return personalized ? [personalized] : [];
        })
      : clusters;

    return sourceClusters.filter((cluster) => {
      const memberArticles = cluster.articleIds
        .map((id) => articleLookup.get(id))
        .filter((article): article is Article => Boolean(article));
      const matchesTime = memberArticles.some((article) => withinRange(article, timeRange));
      const matchesDomain = activeDomain === "All" || cluster.domain === activeDomain;
      const matchesTags =
        activeTags.length === 0 || activeTags.every((tag) => cluster.tags.includes(tag));
      const excluded =
        personalizedView &&
        memberArticles.length > 0 &&
        memberArticles.every((article) => articleHasExcludedTag(article, profile));

      return matchesTime && matchesDomain && matchesTags && !excluded;
    });
  }, [
    activeDomain,
    activeTags,
    affinities,
    articleLookup,
    clusters,
    personalizedView,
    profile,
    rules,
    timeRange,
  ]);

  const filteredPatterns = useMemo(() => {
    const tagsToUse = activeTags.length
      ? patterns.trendingUp.filter((entry) => activeTags.includes(entry.tag))
      : patterns.trendingUp;

    const prioritized = personalizedView
      ? [...tagsToUse].sort((left, right) => {
          const leftBoost = profile.preferred_tags.includes(left.tag) ? 1 : 0;
          const rightBoost = profile.preferred_tags.includes(right.tag) ? 1 : 0;
          return rightBoost - leftBoost || right.delta - left.delta;
        })
      : tagsToUse;

    return prioritized.slice(0, 6);
  }, [activeTags, patterns.trendingUp, personalizedView, profile.preferred_tags]);

  const filteredLongTerm = useMemo(() => {
    const rising = activeTags.length
      ? longTermTrends.rising.filter((entry) => activeTags.includes(entry.tag))
      : longTermTrends.rising;

    const prioritized = personalizedView
      ? [...rising].sort((left, right) => {
          const leftBoost = profile.preferred_tags.includes(left.tag) ? 1 : 0;
          const rightBoost = profile.preferred_tags.includes(right.tag) ? 1 : 0;
          return rightBoost - leftBoost || right.delta - left.delta;
        })
      : rising;

    return prioritized.slice(0, 6);
  }, [activeTags, longTermTrends.rising, personalizedView, profile.preferred_tags]);

  const trendSignals = useMemo<TrendSignal[]>(() => {
    const fromPatterns = patterns.trendingUp.map((trend) => ({
      tag: trend.tag,
      direction: trend.delta > 0 ? "up" as const : trend.delta < 0 ? "down" as const : "flat" as const,
      velocity: trend.delta,
      current: trend.current,
      previous: trend.previous,
      points: [
        { period: "previous", count: trend.previous },
        { period: patterns.generatedAt.slice(0, 10), count: trend.current },
      ],
    }));
    const seed = initialTrendSignals.length ? initialTrendSignals : fromPatterns;
    const filtered = activeTags.length
      ? seed.filter((trend) => activeTags.includes(trend.tag))
      : seed;

    return filtered.slice(0, 8);
  }, [activeTags, initialTrendSignals, patterns.generatedAt, patterns.trendingUp]);

  const megaStories = useMemo(() => {
    const todaysClusters = filteredClusters.filter((cluster) =>
      cluster.articleIds.some((id) => {
        const article = articleLookup.get(id);
        return article ? withinRange(article, "today") : false;
      }),
    );

    return [...todaysClusters]
      .sort((left, right) => {
        const rightScore = personalizedView
          ? (right.adaptiveScore ?? right.impactScore)
          : right.impactScore;
        const leftScore = personalizedView
          ? (left.adaptiveScore ?? left.impactScore)
          : left.impactScore;
        return rightScore - leftScore;
      })
      .slice(0, MEGA_STORY_LIMIT);
  }, [articleLookup, filteredClusters, personalizedView]);

  const sortedArticles = useMemo(() => {
    return [...filteredArticles].sort((left, right) => {
      const rightScore = personalizedView
        ? (scoreLookup.get(right.id) ?? right.importance)
        : getEffectiveImportance(right, feedbackMap);
      const leftScore = personalizedView
        ? (scoreLookup.get(left.id) ?? left.importance)
        : getEffectiveImportance(left, feedbackMap);

      return rightScore - leftScore ||
          new Date(right.date).getTime() - new Date(left.date).getTime();
    });
  }, [feedbackMap, filteredArticles, personalizedView, scoreLookup]);

  const sortedClusters = useMemo(() => {
    return [...filteredClusters].sort((left, right) => {
      const rightScore = personalizedView ? (right.adaptiveScore ?? right.impactScore) : right.impactScore;
      const leftScore = personalizedView ? (left.adaptiveScore ?? left.impactScore) : left.impactScore;
      return rightScore - leftScore;
    });
  }, [filteredClusters, personalizedView]);

  const derivedThreads = useMemo(
    () => deriveThreadsFromClusters(clusters),
    [clusters],
  );

  const mergedMemoryState = useMemo<MemoryState>(() => {
    const persistedIds = new Set(memoryState.threads.map((thread) => thread.id));
    const seed = memoryState.threads;
    const newFromDerived = derivedThreads.threads.filter(
      (thread) => !persistedIds.has(thread.id),
    );
    return {
      ...memoryState,
      threads: reconcileThreads([...seed, ...newFromDerived], memoryState.threads),
    };
  }, [derivedThreads, memoryState]);

  useEffect(() => {
    if (!window.desktop?.memory || clusters.length === 0) return;
    const payload = {
      clusters,
      threads: derivedThreads.threads,
      snapshotAt: new Date().toISOString(),
    };
    void window.desktop.memory.snapshotClusters(payload).catch((error) => {
      console.warn("[memory] snapshotClusters failed", error);
    });
  }, [clusters, derivedThreads]);

  const markClusterViewed = useCallback((clusterId: string) => {
    setMemoryState((current) => ({
      ...current,
      clusterViewStates: {
        ...current.clusterViewStates,
        [clusterId]: new Date().toISOString(),
      },
    }));
    void window.desktop?.memory?.markClusterViewed(clusterId);
  }, []);

  const markDomainViewed = useCallback((domain: ArticleDomain) => {
    setMemoryState((current) => {
      const entry = current.domainViewStates[domain];
      return {
        ...current,
        domainViewStates: {
          ...current.domainViewStates,
          [domain]: {
            lastViewedAt: new Date().toISOString(),
            collapsed: entry?.collapsed ?? false,
          },
        },
      };
    });
    void window.desktop?.memory?.markDomainViewed(domain);
  }, []);

  const setDomainCollapsedState = useCallback(
    (domain: ArticleDomain, collapsed: boolean) => {
      setMemoryState((current) => {
        const entry = current.domainViewStates[domain];
        return {
          ...current,
          domainViewStates: {
            ...current.domainViewStates,
            [domain]: {
              lastViewedAt: entry?.lastViewedAt ?? new Date().toISOString(),
              collapsed,
            },
          },
        };
      });
      void window.desktop?.memory?.setDomainCollapsed({ domain, collapsed });
    },
    [],
  );
  const narrativeThreads = useMemo(
    () => {
      const built = buildNarrativeThreads(sortedClusters);
      return built.length ? built : initialNarratives;
    },
    [initialNarratives, sortedClusters],
  );
  const connections = useMemo(
    () => {
      const built = computeConnections(sortedClusters);
      return built.length ? built : initialConnections;
    },
    [initialConnections, sortedClusters],
  );
  const narrativeInsights = useMemo<NarrativeInsightReport>(() => ({
    whatChanged: trendSignals
      .filter((trend) => trend.direction !== "flat")
      .map((trend) => `${trend.tag.replace(/_/g, " ")} moved ${trend.direction}.`)
      .slice(0, 4),
    emergingTrends: trendSignals
      .filter((trend) => trend.direction === "up")
      .map((trend) => `${trend.tag.replace(/_/g, " ")} is gaining speed.`)
      .slice(0, 4),
    keyNarratives: narrativeThreads.map((thread) => thread.summary).slice(0, 4),
    crossDomainInsights: connections
      .map((connection) => `${connection.source} is connected to ${connection.target}.`)
      .slice(0, 4),
  }), [connections, narrativeThreads, trendSignals]);
  const scenarios = useMemo(
    () => {
      const generated = generateScenarios({
        trends: trendSignals,
        narratives: narrativeThreads,
        connections,
      });
      return generated.length ? generated : initialScenarios;
    },
    [connections, initialScenarios, narrativeThreads, trendSignals],
  );
  const implications = useMemo(
    () => initialImplications.length ? initialImplications : scenarios.map(generateImplications),
    [initialImplications, scenarios],
  );
  const watchItems = useMemo(
    () => initialWatchItems.length ? initialWatchItems : scenarios.map(generateWatchItems),
    [initialWatchItems, scenarios],
  );
  const orderedWeeklyShifts = useMemo(() => {
    if (!personalizedView) {
      return brief.top_shifts;
    }

    return [...brief.top_shifts].sort((left, right) => {
      const leftTag = inferRelatedTag(left, profile.preferred_tags);
      const rightTag = inferRelatedTag(right, profile.preferred_tags);
      return Number(Boolean(rightTag)) - Number(Boolean(leftTag));
    });
  }, [brief.top_shifts, personalizedView, profile.preferred_tags]);

  const visibleInsights = useMemo(() => {
    if (!activeTags.length) {
      return insightReport.insights.slice(0, 5);
    }

    return insightReport.insights.filter((insight) => {
      const text = `${insight.title} ${insight.explanation}`.toLowerCase();
      return activeTags.some((tag) => {
        const readable = tag.replace(/_/g, " ");
        return text.includes(tag) || text.includes(readable);
      });
    });
  }, [activeTags, insightReport.insights]);

  const headerLabel =
    timeRange === "today" ? "Today" : timeRange === "week" ? "This Week" : "This Month";
  const activeFilterCount =
    (activeDomain === "All" ? 0 : 1) + activeTags.length + (personalizedView ? 1 : 0);
  const lastRefreshDate = new Date(fetchedAt);
  const lastRefreshLabel = lastRefreshDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const kpiTiles = useMemo<KPITile[]>(() => {
    const windowDays = timeRange === "today" ? 1 : timeRange === "week" ? 7 : 30;
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const buckets = Array.from({ length: windowDays }, () => 0);

    for (const article of articles) {
      const age = now - new Date(article.date).getTime();
      if (age < 0 || age > windowDays * dayMs) continue;
      const idx = Math.min(windowDays - 1, Math.floor(age / dayMs));
      buckets[windowDays - 1 - idx] += 1;
    }

    const activityData = windowDays > 1 ? buckets : [Math.max(0, buckets[0]), buckets[0]];

    const signalsCount = megaStories.length;
    const signalsSpark = megaStories.length
      ? megaStories.map((cluster) => cluster.impactScore)
      : [0, 0];

    const uniqueSources = new Set<string>();
    for (const cluster of sortedClusters) {
      for (const source of cluster.sources) uniqueSources.add(source);
    }
    const sourcesCount = uniqueSources.size;

    const impactAvg = megaStories.length
      ? megaStories.reduce((sum, cluster) => sum + cluster.impactScore, 0) /
        megaStories.length
      : 0;
    const impactSpark = sortedClusters.length
      ? sortedClusters.slice(0, 8).map((cluster) => cluster.impactScore)
      : [0, 0];

    const filteredCount = filteredArticles.length;
    const prevWindowStart = now - 2 * windowDays * dayMs;
    const prevWindowEnd = now - windowDays * dayMs;
    const currentWindowCount = articles.filter((article) => {
      const t = new Date(article.date).getTime();
      return t >= prevWindowEnd;
    }).length;
    const prevWindowCount = articles.filter((article) => {
      const t = new Date(article.date).getTime();
      return t >= prevWindowStart && t < prevWindowEnd;
    }).length;
    const articleDelta =
      prevWindowCount > 0
        ? Math.round(((currentWindowCount - prevWindowCount) / prevWindowCount) * 100)
        : currentWindowCount > 0
          ? 100
          : 0;
    const articleDeltaDirection: KPITile["deltaDirection"] =
      articleDelta > 0 ? "up" : articleDelta < 0 ? "down" : "flat";

    return [
      {
        label: "Mega stories",
        value: String(signalsCount),
        delta: personalizedView ? "personal" : "top 3",
        deltaDirection: "flat",
        spark: signalsSpark,
        sparkColor: "#0284c7",
      },
      {
        label: "Sources",
        value: String(sourcesCount),
        delta: `${sortedClusters.length} clusters`,
        deltaDirection: "flat",
        spark: activityData,
        sparkColor: "#0f766e",
      },
      {
        label: "Impact",
        value: impactAvg.toFixed(1),
        delta: "avg",
        deltaDirection: "flat",
        spark: impactSpark,
        sparkColor: "#f59e0b",
      },
      {
        label: "Coverage",
        value: String(filteredCount),
        delta: `${articleDelta > 0 ? "+" : ""}${articleDelta}%`,
        deltaDirection: articleDeltaDirection,
        spark: activityData,
        sparkColor: articleDelta >= 0 ? "#059669" : "#e11d48",
      },
    ];
  }, [articles, filteredArticles.length, megaStories, personalizedView, sortedClusters, timeRange]);
  const desktopExportPayload = useMemo(
    () => ({
      exportedAt: new Date().toISOString(),
      view: {
        timeRange,
        activeDomain,
        activeTags,
        personalizedView,
      },
      articles: sortedArticles.map((article) => ({
        id: article.id,
        headline: article.headline,
        summary: article.summary,
        domain: article.domain,
        tags: article.tags,
        importance: article.importance,
        score: scoreLookup.get(article.id) ?? article.importance,
        source: article.source,
        url: article.url,
        date: article.date,
      })),
      clusters: sortedClusters.map((cluster) => ({
        id: cluster.id,
        headline: cluster.headline,
        summary: cluster.summary,
        whyItMatters: cluster.whyItMatters,
        sources: cluster.sources,
        sourceCount: cluster.sourceCount,
        tags: cluster.tags,
        entities: cluster.entities,
        domain: cluster.domain,
        impactScore: cluster.impactScore,
        adaptiveScore: cluster.adaptiveScore,
        personalizationReasons: cluster.personalizationReasons,
        confidence: cluster.confidence,
        articleCount: cluster.articleIds.length,
      })),
      trendSignals,
      narratives: narrativeThreads,
      connections,
      scenarios,
      implications,
      watchItems,
      affinities,
      rules,
      feedback: feedbackMap,
      learning: learningProfile,
    }),
    [
      activeDomain,
      activeTags,
      affinities,
      feedbackMap,
      connections,
      implications,
      learningProfile,
      narrativeThreads,
      personalizedView,
      rules,
      scenarios,
      scoreLookup,
      sortedArticles,
      sortedClusters,
      timeRange,
      trendSignals,
      watchItems,
    ],
  );
  const outputData = useMemo(
    () => ({
      articles: sortedArticles,
      storyClusters: sortedClusters,
      brief,
      patterns,
      trendSignals,
      narratives: narrativeThreads,
      connections,
      scenarios,
      implications,
      watchItems,
      insightReport,
    }),
    [
      brief,
      connections,
      implications,
      insightReport,
      narrativeThreads,
      patterns,
      scenarios,
      sortedArticles,
      sortedClusters,
      trendSignals,
      watchItems,
    ],
  );

  const setSingleTag = (tag: string) => {
    setActiveTags((current) =>
      current.includes(tag) ? current : [...current, tag],
    );
  };

  const toggleTag = (tag: string) => {
    setActiveTags((current) =>
      current.includes(tag)
        ? current.filter((value) => value !== tag)
        : [...current, tag],
    );
  };

  const toggleRecallSelect = useCallback((articleId: string) => {
    setSelectedRecallIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });
  }, []);

  const clearRecallSelect = useCallback(() => {
    setSelectedRecallIds(() => new Set());
  }, []);

  const handleSendToRecall = useCallback(async () => {
    if (selectedRecallIds.size === 0) return;
    const articleMap = new Map(articles.map((article) => [article.id, article]));
    const selectedArticles = Array.from(selectedRecallIds)
      .map((id) => articleMap.get(id))
      .filter((article): article is Article => Boolean(article && article.url));

    if (selectedArticles.length === 0) {
      setRecallNotice("No selected articles have URLs to export.");
      return;
    }

    const now = new Date();
    const html = buildBookmarksHtml(selectedArticles, now);
    const filename = buildExportFilename(now);

    const desktopExport = window.desktop?.exports?.exportRecallBookmarks;
    if (typeof desktopExport === "function") {
      const result = await desktopExport({ html, filename });
      if (!result.success) {
        setRecallNotice(result.error ?? "Export canceled.");
        return;
      }
    } else {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    }

    setRecallNotice(
      `Saved ${selectedArticles.length} URLs. In Recall: Add Content → Import → Import Bookmarks → choose this file.`,
    );
    window.open(RECALL_IMPORT_URL, "_blank", "noopener,noreferrer");
    clearRecallSelect();
  }, [articles, clearRecallSelect, selectedRecallIds]);

  const handleShiftClick = (text: string) => {
    const related = inferRelatedTag(text, availableTags) ??
      inferRelatedTag(text, profile.preferred_tags);
    if (related) {
      setSingleTag(related);
    }
  };

  const togglePreferredDomain = (domain: ArticleDomain) => {
    setProfile((current) => ({
      ...current,
      preferred_domains: current.preferred_domains.includes(domain)
        ? current.preferred_domains.filter((value) => value !== domain)
        : [...current.preferred_domains, domain],
    }));
  };

  const togglePreferredTag = (tag: string) => {
    setProfile((current) => ({
      ...current,
      preferred_tags: current.preferred_tags.includes(tag)
        ? current.preferred_tags.filter((value) => value !== tag)
        : [...current.preferred_tags, tag],
    }));
  };

  const toggleExcludedTag = (tag: string) => {
    setProfile((current) => ({
      ...current,
      excluded_tags: current.excluded_tags.includes(tag)
        ? current.excluded_tags.filter((value) => value !== tag)
        : [...current.excluded_tags, tag],
    }));
  };

  const rebuildAndStoreLearning = (nextFeedback: Record<string, ImportanceFeedback>) => {
    const nextLearningProfile = rebuildLearningProfile(articles, nextFeedback);
    setLearningProfile(nextLearningProfile);
    saveLearningProfile(nextLearningProfile);
  };

  const handleImportanceChange = (
    article: Article,
    userImportance: 1 | 2 | 3 | 4 | 5,
  ) => {
    const nextFeedback = setUserImportance(
      article.id,
      article.importance,
      userImportance,
      feedbackMap,
    );
    setFeedbackMap(nextFeedback);
    rebuildAndStoreLearning(nextFeedback);
    void window.desktop?.data.saveImportanceFeedback({
      articleId: article.id,
      originalImportance: article.importance,
      userImportance,
    });
  };

  const handleImportanceReset = (article: Article) => {
    const nextFeedback = resetUserImportance(article.id, feedbackMap);
    setFeedbackMap(nextFeedback);
    rebuildAndStoreLearning(nextFeedback);
    void window.desktop?.data.saveImportanceFeedback({
      articleId: article.id,
      reset: true,
    });
  };

  const handleClusterFeedback = (
    cluster: StoryCluster,
    action: UserFeedbackAction,
    value?: number,
  ) => {
    const feedback = {
      clusterId: cluster.id,
      action,
      value: value ?? null,
      createdAt: new Date().toISOString(),
    };

    setAffinities((current) => updateAffinitiesFromFeedback([feedback], [cluster], current));

    if (window.desktop) {
      void window.desktop.data.saveUserFeedback({
        clusterId: cluster.id,
        action,
        value,
        cluster,
      }).then((result) => {
        if (result.affinities) {
          setAffinities(result.affinities);
        }
      });
      return;
    }

    void fetch("/api/feedback/story", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clusterId: cluster.id,
        action,
        value,
        cluster,
      }),
    });
  };

  const handleClearLearning = () => {
    clearImportanceFeedback();
    clearLearningProfile();
    setFeedbackMap({});
    setLearningProfile({
      domainAdjustments: {},
      tagAdjustments: {},
      sampleCount: 0,
    });
    void window.desktop?.data.clearLearningProfile();
  };

  const rightRail = articles.length ? (
    <div className="space-y-4">
      <WeeklyShifts
        items={orderedWeeklyShifts}
        activeTag={activeTags[0] ?? null}
        onShiftClick={handleShiftClick}
      />
      <KeyInsights
        insights={visibleInsights}
        narrativeInsights={insightReport.narrativeInsights ?? narrativeInsights}
        scenarios={scenarios}
        implications={implications}
        watchItems={watchItems}
        activeTags={activeTags}
        onInsightClick={handleShiftClick}
      />
      <TrendsPanel
        emerging={filteredPatterns}
        longTerm={filteredLongTerm}
        trendSignals={trendSignals}
        narratives={narrativeThreads}
        connections={connections}
        activeTags={activeTags}
        personalizedView={personalizedView}
        onTrendClick={setSingleTag}
      />
    </div>
  ) : null;

  return (
    <AppShell aside={rightRail} activePath="/">
      <div className="space-y-6">
        <header className="surface-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="section-kicker">Tech Intelligence</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                Command Center
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                High-signal articles, shifts, and trend context in one scanning view.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="live-dot">{headerLabel} · updated {lastRefreshLabel}</span>
                <span className="font-mono uppercase tracking-[0.08em] text-slate-400">
                  {activeFilterCount
                    ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active`
                    : "No filters"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <KPIStrip tiles={kpiTiles} />
          </div>

          <div className="panel-divider flex flex-col gap-3 text-sm text-slate-500 lg:flex-row lg:items-center lg:justify-between">
            <div>
              Last refresh <span className="font-medium text-slate-700">{lastRefreshLabel}</span>
            </div>
            <DesktopControls
              exportPayload={desktopExportPayload}
              refreshStatus={refreshStatus}
              onRefreshComplete={loadDesktopData}
              onPreferencesLoaded={(preferences) => {
                setPersonalizedView(preferences.personalizedDefault);
                if (preferences.lastRefreshError) {
                  setRefreshStatus("Cached data");
                }
              }}
              onClearLearning={handleClearLearning}
            />
          </div>
        </header>

        <SearchCommandPanel
          availableDomains={availableDomains}
          availableTags={availableTags}
        />

        <FiltersBar
          timeRange={timeRange}
          activeDomain={activeDomain}
          activeTags={activeTags}
          availableTags={availableTags}
          tagQuery={tagQuery}
          personalizedView={personalizedView}
          profile={profile}
          onTimeRangeChange={setTimeRange}
          onDomainChange={setActiveDomain}
          onTagToggle={toggleTag}
          onTagQueryChange={setTagQuery}
          onClearTags={() => setActiveTags([])}
          onPersonalizedViewChange={setPersonalizedView}
          onPreferredDomainToggle={togglePreferredDomain}
          onPreferredTagToggle={togglePreferredTag}
          onExcludedTagToggle={toggleExcludedTag}
          onClearImportanceLearning={handleClearLearning}
        />

        {articles.length ? (
          <>
            <MegaStoryStrip
              clusters={megaStories}
              articleLookup={articleLookup}
              scenarios={scenarios}
              implications={implications}
              watchItems={watchItems}
              activeTags={activeTags}
              feedbackMap={feedbackMap}
              learningProfile={learningProfile}
              personalizedView={personalizedView}
              scoreLookup={scoreLookup}
              memoryState={mergedMemoryState}
              onTagClick={toggleTag}
              onClusterFeedback={handleClusterFeedback}
              onImportanceChange={handleImportanceChange}
              onImportanceReset={handleImportanceReset}
              onClusterViewed={markClusterViewed}
            />

            <DomainBreadthView
              clusters={sortedClusters}
              articleLookup={articleLookup}
              feedbackMap={feedbackMap}
              learningProfile={learningProfile}
              personalizedView={personalizedView}
              scoreLookup={scoreLookup}
              activeTags={activeTags}
              memoryState={mergedMemoryState}
              onTagClick={toggleTag}
              onImportanceChange={handleImportanceChange}
              onImportanceReset={handleImportanceReset}
              onClusterViewed={markClusterViewed}
              onDomainViewed={markDomainViewed}
              onDomainCollapsed={setDomainCollapsedState}
            />

            <ArticleFeed
              articles={sortedArticles}
              activeTags={activeTags}
              personalizedView={personalizedView}
              scoreLookup={scoreLookup}
              feedbackMap={feedbackMap}
              learningProfile={learningProfile}
              selectedIds={selectedRecallIds}
              onTagClick={toggleTag}
              onImportanceChange={handleImportanceChange}
              onImportanceReset={handleImportanceReset}
              onToggleSelect={toggleRecallSelect}
            />

            <OutputGenerationPanel data={outputData} />

            <div className="xl:hidden">
              {rightRail}
            </div>
          </>
        ) : (
          <section className="surface-card p-5 sm:p-6">
            <p className="section-kicker">Local Cache</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">
              Waiting for articles
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              No articles are available for the current data source yet. Refresh, import
              data, or check source configuration; then the signal, trend, and article
              sections will appear here.
            </p>
          </section>
        )}
      </div>
      {recallNotice ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg"
        >
          {recallNotice}
          <button
            type="button"
            onClick={() => setRecallNotice(null)}
            className="ml-3 text-xs font-medium text-sky-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <RecallActionBar
        selectedCount={selectedRecallIds.size}
        onClear={clearRecallSelect}
        onSend={handleSendToRecall}
      />
    </AppShell>
  );
}
