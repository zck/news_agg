
import type {
  Confidence,
  ScanRow,
  TrendDir,
} from "@/lib/scanViewModel";
import {
  ARTICLE_DOMAINS,
  type ArticleDomain,
  type EntityType,
  type ExtractedEntity,
  type StoryCluster,
} from "@/lib/types";

// A teaching-pack entry is a self-contained snapshot of the story at the
// moment the user saved it. Articles churn constantly (feeds refresh, the
// scan view only loads a recent window, cluster leads drift as new members
// arrive), so persisting bare article ids loses entries as soon as the id
// stops resolving. The snapshot keeps everything the drawer and the
// markdown/slide exports need; live rows are only used to refresh display
// when the story is still on screen.
export type TeachingItem = {
  id: string;            // anchor article id (cluster lead when saved)
  addedAt: string;
  memberIds: string[];   // cluster member ids when saved — used to re-match live rows
  domain: ArticleDomain;
  headline: string;
  summary: string;
  source?: string;
  url?: string;
  date: string;
  tags: string[];
  impact: number;
  confidence: Confidence;
  sourceCount: number;
  articleCount: number;
  sources: string[];
  whyItMatters: string[];
  entities: ExtractedEntity[];
  trendDelta: number;
  trendDir: TrendDir;
};

const DOMAIN_SET = new Set<string>(ARTICLE_DOMAINS);
const CONFIDENCE_LEVELS = new Set<Confidence>(["low", "medium", "high"]);
const TREND_DIRS = new Set<TrendDir>(["up", "down", "flat"]);
const ENTITY_TYPES = new Set<EntityType>([
  "company",
  "person",
  "product",
  "technology",
  "place",
  "other",
]);

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function teachingItemFromRow(row: ScanRow, addedAt: string): TeachingItem {
  return {
    id: row.id,
    addedAt,
    memberIds: uniqueStrings([row.id, ...row.members.map((m) => m.id)]),
    domain: row.domain,
    headline: row.headline,
    summary: row.summary,
    source: row.source,
    url: row.url,
    date: row.date,
    tags: [...row.tags],
    impact: row.impact,
    confidence: row.confidence,
    sourceCount: row.sourceCount,
    articleCount: row.articleCount,
    sources: [...row.sources],
    whyItMatters: [...row.whyItMatters],
    entities: row.entities.map((e) => ({ ...e })),
    trendDelta: row.trendDelta,
    trendDir: row.trendDir,
  };
}

// Inflate a snapshot back into a ScanRow so the drawer and the export
// builders can treat saved-but-no-longer-loaded stories like live ones.
// Fields the snapshot doesn't carry get neutral defaults.
export function teachingItemToRow(item: TeachingItem): ScanRow {
  const importance = Math.min(
    5,
    Math.max(1, Math.round((Number(item.impact) || 0) / 2)),
  ) as ScanRow["importance"];
  return {
    id: item.id,
    clusterId: `teaching-${item.id}`,
    domain: item.domain,
    headline: item.headline,
    summary: item.summary ?? "",
    source: item.source,
    url: item.url,
    date: item.date ?? "",
    tags: item.tags ?? [],
    impact: Number(item.impact) || 0,
    confidence: item.confidence,
    sourceCount: item.sourceCount ?? 0,
    articleCount: item.articleCount ?? 0,
    sources: item.sources ?? [],
    whyItMatters: item.whyItMatters ?? [],
    entities: item.entities ?? [],
    members: [
      {
        id: item.id,
        src: item.source ?? "—",
        t: item.headline,
        time: "",
        url: item.url,
      },
    ],
    spark: new Array<number>(12).fill(0),
    trendDelta: item.trendDelta ?? 0,
    trendDir: item.trendDir,
    topTag: null,
    importance,
  };
}

// articleId -> teaching item id, covering both the anchor id and every
// member id captured at save time. Lets rows keep matching after the
// cluster lead drifts to a different article.
export function buildTeachingLookup(items: TeachingItem[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const item of items) {
    if (!lookup.has(item.id)) lookup.set(item.id, item.id);
    for (const memberId of item.memberIds ?? []) {
      if (!lookup.has(memberId)) lookup.set(memberId, item.id);
    }
  }
  return lookup;
}

export function findTeachingItemIdForRow(
  row: ScanRow,
  lookup: Map<string, string>,
): string | undefined {
  const direct = lookup.get(row.id);
  if (direct) return direct;
  for (const member of row.members) {
    const hit = lookup.get(member.id);
    if (hit) return hit;
  }
  return undefined;
}

export function dedupeTeachingItems(items: TeachingItem[]): TeachingItem[] {
  const seen = new Set<string>();
  const out: TeachingItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// One-time upgrade from the legacy id-only format. Resolves each saved id
// against the current clusters (lead id, sampled member ids, or the full
// cluster membership) and snapshots the matching row. Ids that no longer
// resolve have nothing left to snapshot and are dropped — under the old
// format they were already invisible.
export function migrateLegacyTeachingIds(
  ids: string[],
  rows: ScanRow[],
  clusters: StoryCluster[],
  addedAt: string,
): TeachingItem[] {
  const rowByArticleId = new Map<string, ScanRow>();
  for (const row of rows) {
    if (!rowByArticleId.has(row.id)) rowByArticleId.set(row.id, row);
    for (const member of row.members) {
      if (!rowByArticleId.has(member.id)) rowByArticleId.set(member.id, row);
    }
  }
  const rowByClusterId = new Map(rows.map((row) => [row.clusterId, row] as const));
  for (const cluster of clusters) {
    const row = rowByClusterId.get(cluster.id);
    if (!row) continue;
    for (const articleId of cluster.articleIds) {
      if (!rowByArticleId.has(articleId)) rowByArticleId.set(articleId, row);
    }
  }

  const out: TeachingItem[] = [];
  const seenClusters = new Set<string>();
  for (const id of ids) {
    const row = rowByArticleId.get(id);
    if (!row || seenClusters.has(row.clusterId)) continue;
    seenClusters.add(row.clusterId);
    const item = teachingItemFromRow(row, addedAt);
    // Keep the legacy id reachable so re-toggling the same story matches.
    item.memberIds = uniqueStrings([...item.memberIds, id]);
    out.push(item);
  }
  return out;
}

// Defensive normalization for values read back from the desktop DB or
// localStorage — IPC payloads and stored JSON are untyped at runtime.
export function normalizeTeachingItems(value: unknown): TeachingItem[] {
  if (!Array.isArray(value)) return [];
  const out: TeachingItem[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id : "";
    const headline = typeof candidate.headline === "string" ? candidate.headline : "";
    if (!id || !headline || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      addedAt: typeof candidate.addedAt === "string" ? candidate.addedAt : "",
      memberIds: Array.isArray(candidate.memberIds)
        ? uniqueStrings(candidate.memberIds.filter((v): v is string => typeof v === "string"))
        : [],
      domain:
        typeof candidate.domain === "string" && DOMAIN_SET.has(candidate.domain)
          ? (candidate.domain as ArticleDomain)
          : "General",
      headline,
      summary: typeof candidate.summary === "string" ? candidate.summary : "",
      source: typeof candidate.source === "string" ? candidate.source : undefined,
      url: typeof candidate.url === "string" ? candidate.url : undefined,
      date: typeof candidate.date === "string" ? candidate.date : "",
      tags: Array.isArray(candidate.tags)
        ? candidate.tags.filter((v): v is string => typeof v === "string")
        : [],
      impact: Number.isFinite(Number(candidate.impact)) ? Number(candidate.impact) : 0,
      confidence: CONFIDENCE_LEVELS.has(candidate.confidence as Confidence)
        ? (candidate.confidence as Confidence)
        : "low",
      sourceCount: Number.isFinite(Number(candidate.sourceCount))
        ? Number(candidate.sourceCount)
        : 0,
      articleCount: Number.isFinite(Number(candidate.articleCount))
        ? Number(candidate.articleCount)
        : 0,
      sources: Array.isArray(candidate.sources)
        ? candidate.sources.filter((v): v is string => typeof v === "string")
        : [],
      whyItMatters: Array.isArray(candidate.whyItMatters)
        ? candidate.whyItMatters.filter((v): v is string => typeof v === "string")
        : [],
      entities: Array.isArray(candidate.entities)
        ? candidate.entities
            .map((e): ExtractedEntity | null => {
              if (!e || typeof e !== "object") return null;
              const entity = e as Record<string, unknown>;
              if (typeof entity.name !== "string" || !entity.name) return null;
              return {
                name: entity.name,
                normalized:
                  typeof entity.normalized === "string" && entity.normalized
                    ? entity.normalized
                    : entity.name.toLowerCase(),
                type: ENTITY_TYPES.has(entity.type as EntityType)
                  ? (entity.type as EntityType)
                  : "other",
              };
            })
            .filter((e): e is ExtractedEntity => Boolean(e))
        : [],
      trendDelta: Number.isFinite(Number(candidate.trendDelta))
        ? Number(candidate.trendDelta)
        : 0,
      trendDir: TREND_DIRS.has(candidate.trendDir as TrendDir)
        ? (candidate.trendDir as TrendDir)
        : "flat",
    });
  }
  return out;
}
