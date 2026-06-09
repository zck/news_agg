// /Users/montysharma/Projects/news_agg/news_agg/lib/scanViewModel.ts

import { clusterArticles } from "@/lib/clustering";
import type { Article, ArticleDomain, ExtractedEntity, StoryCluster } from "@/lib/types";
import { ARTICLE_DOMAINS, DOMAIN_LABELS } from "@/lib/types";

// ─── Palette ──────────────────────────────────────────────────
// Ported verbatim from the design's data.jsx so per-domain rail dots,
// chips, and reader headers match the mocks.
export type DomainPaletteEntry = {
  id: ArticleDomain;
  label: string;
  color: string;
  soft: string;
  ink: string;
};

export const DOMAIN_PALETTE: Record<ArticleDomain, DomainPaletteEntry> = {
  AIUse:    { id: "AIUse",    label: "AI Use",   color: "#7c3aed", soft: "#f5f3ff", ink: "#5b21b6" },
  LLM:      { id: "LLM",      label: "LLM",      color: "#9333ea", soft: "#faf5ff", ink: "#6b21a8" },
  AIInfra:  { id: "AIInfra",  label: "AI Infra", color: "#4f46e5", soft: "#eef2ff", ink: "#3730a3" },
  Semis:    { id: "Semis",    label: "Semis",    color: "#2563eb", soft: "#eff6ff", ink: "#1d4ed8" },
  Cloud:    { id: "Cloud",    label: "Cloud",    color: "#0284c7", soft: "#f0f9ff", ink: "#0369a1" },
  Security: { id: "Security", label: "Security", color: "#dc2626", soft: "#fef2f2", ink: "#b91c1c" },
  Consumer: { id: "Consumer", label: "Consumer", color: "#db2777", soft: "#fdf2f8", ink: "#be185d" },
  Bio:      { id: "Bio",      label: "Bio",      color: "#16a34a", soft: "#f0fdf4", ink: "#15803d" },
  Climate:  { id: "Climate",  label: "Climate",  color: "#059669", soft: "#ecfdf5", ink: "#047857" },
  Crypto:   { id: "Crypto",   label: "Crypto",   color: "#d97706", soft: "#fffbeb", ink: "#b45309" },
  Policy:   { id: "Policy",   label: "Policy",   color: "#ea580c", soft: "#fff7ed", ink: "#c2410c" },
  Space:    { id: "Space",    label: "Space",    color: "#0d9488", soft: "#f0fdfa", ink: "#0f766e" },
  Robotics: { id: "Robotics", label: "Robotics", color: "#0891b2", soft: "#ecfeff", ink: "#155e75" },
  Batteries:{ id: "Batteries",label: "Batteries",color: "#65a30d", soft: "#f7fee7", ink: "#4d7c0f" },
  AR:       { id: "AR",       label: "AR",       color: "#c026d3", soft: "#fae8ff", ink: "#a21caf" },
  Materials:{ id: "Materials",label: "Materials",color: "#78716c", soft: "#fafaf9", ink: "#44403c" },
  General:  { id: "General",  label: "General",  color: "#475569", soft: "#f8fafc", ink: "#334155" },
};

// ─── Interest scale ───────────────────────────────────────────
// Design level → stored 5-level importance. The 4-level UI replaces
// the legacy 1-5 importance UI on /scan but writes back to the same
// store so the existing learning system (lib/feedback.ts) keeps working.
export type InterestLevel = 1 | 2 | 3 | 4; // 4=Important, 3=Interesting, 2=Later, 1=Skip

export const INTEREST_LEVELS: ReadonlyArray<{
  id: InterestLevel;
  label: string;
  short: string;
  color: string;
  bg: string;
  glyph: string;
}> = [
  { id: 4, label: "Important",      short: "Important",   color: "#0284c7", bg: "#e0f2fe", glyph: "★" },
  { id: 3, label: "Interesting",    short: "Interesting", color: "#0f766e", bg: "#ccfbf1", glyph: "◆" },
  { id: 2, label: "If I have time", short: "Later",       color: "#b45309", bg: "#fef3c7", glyph: "◐" },
  { id: 1, label: "Don't care",     short: "Skip",        color: "#be123c", bg: "#fee2e2", glyph: "✕" },
];

const INTEREST_TO_IMPORTANCE: Record<InterestLevel, 1 | 2 | 4 | 5> = {
  4: 5,
  3: 4,
  2: 2,
  1: 1,
};

const IMPORTANCE_TO_INTEREST: Record<1 | 2 | 3 | 4 | 5, InterestLevel | null> = {
  5: 4,
  4: 3,
  3: null, // legacy/default — treat as unrated in the Terminal UI
  2: 2,
  1: 1,
};

export function interestToImportance(level: InterestLevel): 1 | 2 | 4 | 5 {
  return INTEREST_TO_IMPORTANCE[level];
}

export function importanceToInterest(value: number | null | undefined): InterestLevel | null {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return IMPORTANCE_TO_INTEREST[value];
  }
  return null;
}

// ─── Row view-model ───────────────────────────────────────────
export type Confidence = "high" | "medium" | "low";
export type TrendDir = "up" | "down" | "flat";

export type ScanRowMember = {
  id: string;    // article id (used to fingerprint the cluster)
  src: string;   // source name
  t: string;     // headline
  time: string;  // relative time, e.g. "2h ago"
  url?: string;
};

export type ScanRow = {
  id: string;            // lead article id (feedback is article-keyed)
  clusterId: string;     // synthetic cluster id, useful for keys/debug
  domain: ArticleDomain;
  headline: string;
  summary: string;
  source?: string;       // lead article source
  url?: string;          // lead article url
  date: string;
  tags: string[];
  impact: number;        // 0–10
  confidence: Confidence;
  sourceCount: number;
  articleCount: number;
  sources: string[];
  whyItMatters: string[];
  entities: ExtractedEntity[];
  members: ScanRowMember[];
  spark: number[];       // 12 points
  trendDelta: number;    // signed integer percentage
  trendDir: TrendDir;
  topTag: string | null;
  importance: 1 | 2 | 3 | 4 | 5;
  originalImportance?: 1 | 2 | 3 | 4 | 5;
};

export type ScanShift = {
  tag: string;
  delta: number;
  dir: TrendDir;
  domain: ArticleDomain;
  spark: number[]; // 12 points
};

// ─── Time bucketing ───────────────────────────────────────────
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BUCKETS = 12;

function weekBucketIndex(date: string, refMs: number): number {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return -1;
  const weeksAgo = Math.floor((refMs - t) / WEEK_MS);
  if (weeksAgo < 0 || weeksAgo >= BUCKETS) return -1;
  // Most recent week → last bucket index. Older → earlier.
  return BUCKETS - 1 - weeksAgo;
}

const SKIP_TAGS = new Set(["uncategorized", "tech_monitoring"]);

function pickTopTag(article: Article, tagWeights: Map<string, number>): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const tag of article.tags) {
    if (SKIP_TAGS.has(tag)) continue;
    const score = tagWeights.get(tag) ?? 0;
    if (score > bestScore) {
      best = tag;
      bestScore = score;
    }
  }
  return best;
}

function deriveTrend(spark: number[]): { delta: number; dir: TrendDir } {
  if (spark.length < 8) return { delta: 0, dir: "flat" };
  const half = Math.floor(spark.length / 2);
  const recent = spark.slice(spark.length - half).reduce((a, b) => a + b, 0);
  const prior = spark.slice(0, spark.length - half).reduce((a, b) => a + b, 0);
  if (prior === 0 && recent === 0) return { delta: 0, dir: "flat" };
  if (prior === 0) return { delta: 100, dir: "up" };
  const delta = Math.round(((recent - prior) / prior) * 100);
  if (Math.abs(delta) < 4) return { delta: 0, dir: "flat" };
  return { delta, dir: delta > 0 ? "up" : "down" };
}

function deriveConfidence(article: Article): Confidence {
  const hasSource = Boolean(article.source);
  const hasSummary = Boolean(article.summary && article.summary.length > 80);
  const hasMultiTag = article.tags.filter((t) => !SKIP_TAGS.has(t)).length >= 3;
  const score = (hasSource ? 1 : 0) + (hasSummary ? 1 : 0) + (hasMultiTag ? 1 : 0);
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export type ScanViewModel = {
  rows: ScanRow[];
  shifts: ScanShift[];
  domainStats: Record<ArticleDomain, { count: number; deltaSum: number; n: number }>;
};

function relativeTime(iso: string, refMs: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, refMs - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins || 1}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function articleConfidence(a: Article): Confidence {
  return deriveConfidence(a);
}

function clusterConfidenceLevel(cluster: StoryCluster, members: Article[]): Confidence {
  // Lift confidence when multiple distinct sources cover the same cluster.
  if (cluster.sourceCount >= 3) return "high";
  if (cluster.sourceCount >= 2) return "medium";
  return articleConfidence(members[0]);
}

export function buildScanViewModel(
  articles: Article[],
  precomputedClusters?: StoryCluster[],
): ScanViewModel {
  const refMs = Date.now();
  const articleById = new Map(articles.map((a) => [a.id, a] as const));

  // Per-tag weekly counts (across all articles, not just cluster leads)
  const tagWeekly = new Map<string, number[]>();
  const tagDomainTally = new Map<string, Map<ArticleDomain, number>>();

  for (const a of articles) {
    const idx = weekBucketIndex(a.date, refMs);
    if (idx < 0) continue;
    for (const tag of a.tags) {
      if (SKIP_TAGS.has(tag)) continue;
      let series = tagWeekly.get(tag);
      if (!series) {
        series = new Array<number>(BUCKETS).fill(0);
        tagWeekly.set(tag, series);
      }
      series[idx] += 1;
      let tally = tagDomainTally.get(tag);
      if (!tally) {
        tally = new Map();
        tagDomainTally.set(tag, tally);
      }
      tally.set(a.domain, (tally.get(a.domain) ?? 0) + 1);
    }
  }

  const tagWeights = new Map<string, number>();
  for (const [tag, series] of tagWeekly) {
    tagWeights.set(tag, series.reduce((a, b) => a + b, 0));
  }

  // Cluster client-side. Each cluster groups near-duplicate / same-story articles.
  // Callers can pass pre-computed clusters to avoid re-running the O(n²) grouping
  // on every state change (e.g. user ratings, which only mutate importance fields).
  const clusters = precomputedClusters ?? clusterArticles(articles);

  const rows: ScanRow[] = [];
  for (const cluster of clusters) {
    const members = cluster.articleIds
      .map((id) => articleById.get(id))
      .filter((m): m is Article => Boolean(m));
    const lead = members[0];
    // Defensive: clusterArticles only emits clusters with ≥1 article.
    if (!lead) continue;
    const topTag = pickTopTag(lead, tagWeights);
    const spark = topTag
      ? tagWeekly.get(topTag) ?? new Array<number>(BUCKETS).fill(0)
      : new Array<number>(BUCKETS).fill(0);
    const { delta, dir } = deriveTrend(spark);
    const filteredTags = cluster.tags.filter((t) => !SKIP_TAGS.has(t));
    rows.push({
      id: lead.id,
      clusterId: cluster.id,
      domain: cluster.domain,
      headline: cluster.headline,
      summary: cluster.summary,
      source: lead.source,
      url: lead.url,
      date: lead.date,
      tags: filteredTags,
      // Map lead's 1–5 importance onto the 0–10 impact scale the UI displays.
      impact: lead.importance * 2,
      confidence: clusterConfidenceLevel(cluster, members),
      sourceCount: cluster.sourceCount,
      articleCount: cluster.articleIds.length,
      sources: cluster.sources,
      whyItMatters: cluster.whyItMatters,
      entities: cluster.entities,
      members: members.map((m) => ({
        id: m.id,
        src: m.source ?? "—",
        t: m.headline,
        time: relativeTime(m.processed_at || m.date, refMs),
        url: m.url,
      })),
      spark,
      trendDelta: delta,
      trendDir: dir,
      topTag,
      importance: lead.importance,
      originalImportance: lead.originalImportance,
    });
  }

  // Build shifts: top 8 by absolute delta among tags with enough volume
  const shifts: ScanShift[] = [];
  for (const [tag, spark] of tagWeekly) {
    const total = tagWeights.get(tag) ?? 0;
    if (total < 3) continue; // ignore noise
    const { delta, dir } = deriveTrend(spark);
    if (delta === 0) continue;
    const tally = tagDomainTally.get(tag);
    let topDomain: ArticleDomain = "General";
    if (tally) {
      let best = -1;
      for (const [d, n] of tally) {
        if (n > best) {
          best = n;
          topDomain = d;
        }
      }
    }
    shifts.push({ tag, delta, dir, domain: topDomain, spark });
  }
  shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Domain stats for the rail (cluster-based)
  const emptyStat = () => ({ count: 0, deltaSum: 0, n: 0 });
  const domainStats = ARTICLE_DOMAINS.reduce(
    (acc, d) => {
      acc[d] = emptyStat();
      return acc;
    },
    {} as Record<ArticleDomain, { count: number; deltaSum: number; n: number }>,
  );
  for (const r of rows) {
    const stat = domainStats[r.domain];
    if (!stat) continue;
    stat.count += 1;
    stat.deltaSum += r.trendDelta;
    stat.n += 1;
  }

  return { rows, shifts: shifts.slice(0, 8), domainStats };
}

export function getDomain(id: ArticleDomain): DomainPaletteEntry {
  return DOMAIN_PALETTE[id] ?? DOMAIN_PALETTE.General;
}

export function getDomainLabel(id: ArticleDomain): string {
  return DOMAIN_LABELS[id] ?? DOMAIN_PALETTE[id]?.label ?? id;
}
