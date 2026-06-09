const MAX_STRING = 2000;
const MAX_SEARCH_QUERY = 500;
const MAX_TAG_LEN = 120;
const MAX_NAME = 200;
const MAX_ARRAY = 50;

function clampString(value, max = MAX_STRING) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function clampNumber(value, { min, max } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  let result = parsed;
  if (typeof min === "number") result = Math.max(min, result);
  if (typeof max === "number") result = Math.min(max, result);
  return result;
}

function clampStringArray(value, maxLen = MAX_TAG_LEN) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value.slice(0, MAX_ARRAY)) {
    const s = clampString(item, maxLen);
    if (s !== undefined) out.push(s);
  }
  return out;
}

function pickObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}

function sanitizeArticleFilters(input) {
  const src = pickObject(input);
  return {
    domain: clampString(src.domain, MAX_TAG_LEN),
    tag: clampString(src.tag, MAX_TAG_LEN),
    minImportance: clampNumber(src.minImportance, { min: 1, max: 5 }),
    search: clampString(src.search, MAX_SEARCH_QUERY),
    limit: clampNumber(src.limit, { min: 1, max: 1000 }),
    offset: clampNumber(src.offset, { min: 0, max: 1_000_000 }),
  };
}

function sanitizeSearchInput(input) {
  const src = pickObject(input);
  return {
    q: clampString(src.q, MAX_SEARCH_QUERY) ?? "",
    domains: clampStringArray(src.domains),
    tags: clampStringArray(src.tags),
    dateFrom: clampString(src.dateFrom, 32),
    dateTo: clampString(src.dateTo, 32),
    minImportance: clampNumber(src.minImportance, { min: 1, max: 5 }),
    personalizedOnly: Boolean(src.personalizedOnly),
    limit: clampNumber(src.limit, { min: 1, max: 100 }),
    recordRecent: Boolean(src.recordRecent),
  };
}

function sanitizeSavedSearchPayload(input) {
  const src = pickObject(input);
  const filters = pickObject(src.filters);
  return {
    name: clampString(src.name, MAX_NAME),
    queryText: clampString(src.queryText ?? src.query_text, MAX_SEARCH_QUERY),
    filters: {
      domains: clampStringArray(filters.domains),
      tags: clampStringArray(filters.tags),
      dateFrom: clampString(filters.dateFrom, 32),
      dateTo: clampString(filters.dateTo, 32),
      minImportance: clampNumber(filters.minImportance, { min: 1, max: 5 }),
      personalizedOnly: Boolean(filters.personalizedOnly),
    },
  };
}

function sanitizeWeek(value) {
  const s = clampString(value, 32);
  if (!s) return undefined;
  return /^\d{4}-W\d{2}$|^\d{4}-\d{2}-\d{2}$|^\d{4}-\d{2}$/.test(s) ? s : undefined;
}

function sanitizeArticleId(value) {
  return clampString(value, 256) ?? "";
}

function sanitizeSavedSearchId(value) {
  return clampNumber(value, { min: 1, max: Number.MAX_SAFE_INTEGER });
}

function sanitizeImportanceFeedback(input) {
  const src = pickObject(input);
  const result = {
    articleId: sanitizeArticleId(src.articleId),
    originalImportance: clampNumber(src.originalImportance, { min: 1, max: 5 }),
    userImportance: clampNumber(src.userImportance, { min: 1, max: 5 }),
  };
  if (src.reset === true) {
    result.reset = true;
  }
  return result;
}

function sanitizeUserFeedback(input) {
  const src = pickObject(input);
  return {
    articleId: sanitizeArticleId(src.articleId),
    signal: clampString(src.signal, 64),
    note: clampString(src.note, 2000),
  };
}

const ALLOWED_MEMORY_DOMAINS = new Set([
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
]);

function sanitizeMemoryDomain(value) {
  const s = clampString(value, 32);
  return s && ALLOWED_MEMORY_DOMAINS.has(s) ? s : undefined;
}

function sanitizeClusterIdValue(value) {
  return clampString(value, 256);
}

function sanitizeClusterSnapshotArray(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const entry of input.slice(0, 200)) {
    if (!entry || typeof entry !== "object") continue;
    const id = sanitizeClusterIdValue(entry.id);
    if (!id) continue;
    out.push({
      id,
      headline: clampString(entry.headline, 400),
      summary: clampString(entry.summary, 600),
      domain: sanitizeMemoryDomain(entry.domain),
      domainSecondary: clampStringArray(entry.domainSecondary, 32).filter((value) =>
        ALLOWED_MEMORY_DOMAINS.has(value),
      ),
      tags: clampStringArray(entry.tags, 120),
      entities: Array.isArray(entry.entities)
        ? entry.entities
            .slice(0, 30)
            .map((raw) => {
              if (!raw || typeof raw !== "object") return null;
              const normalized = clampString(raw.normalized, 200);
              if (!normalized) return null;
              return {
                name: clampString(raw.name, 200) ?? normalized,
                normalized,
                type: clampString(raw.type, 40) ?? "other",
              };
            })
            .filter(Boolean)
        : [],
      articleIds: clampStringArray(entry.articleIds, 256),
      sources: clampStringArray(entry.sources, 240),
      sourceCount: clampNumber(entry.sourceCount, { min: 0, max: 10000 }) ?? 0,
      confidence: ["low", "medium", "high"].includes(entry.confidence)
        ? entry.confidence
        : "low",
      impactScore: clampNumber(entry.impactScore, { min: 0, max: 10 }),
      firstSeenAt: clampString(entry.firstSeenAt, 40),
      lastSeenAt: clampString(entry.lastSeenAt, 40),
    });
  }
  return out;
}

function sanitizeNarrativeThreadArray(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const entry of input.slice(0, 100)) {
    if (!entry || typeof entry !== "object") continue;
    const id = clampString(entry.id, 256);
    if (!id) continue;
    out.push({
      id,
      title: clampString(entry.title, 400) ?? id,
      startedAt:
        clampString(entry.startedAt, 40) ?? clampString(entry.firstSeenAt, 40),
      lastUpdatedAt:
        clampString(entry.lastUpdatedAt, 40) ?? clampString(entry.lastSeenAt, 40),
      summary: entry.summary && typeof entry.summary === "object" ? entry.summary : null,
      summaryText: clampString(entry.summaryText ?? entry.summary, 2000),
      clusterIds: clampStringArray(entry.clusterIds, 256),
      lastSeenAt: clampString(entry.lastSeenAt, 40),
    });
  }
  return out;
}

function sanitizeMemorySnapshotPayload(input) {
  const src = pickObject(input);
  return {
    clusters: sanitizeClusterSnapshotArray(src.clusters),
    threads: sanitizeNarrativeThreadArray(src.threads),
    snapshotAt: clampString(src.snapshotAt, 40),
  };
}

function sanitizeDomainCollapsePayload(input) {
  const src = pickObject(input);
  return {
    domain: sanitizeMemoryDomain(src.domain),
    collapsed: Boolean(src.collapsed),
  };
}

function sanitizePreferences(input) {
  const src = pickObject(input);
  return {
    refreshIntervalMinutes: clampNumber(src.refreshIntervalMinutes, { min: 1, max: 10080 }),
    importanceThreshold: clampNumber(src.importanceThreshold, { min: 1, max: 5 }),
    personalizedThreshold: clampNumber(src.personalizedThreshold, { min: 0, max: 10 }),
    notificationsEnabled:
      typeof src.notificationsEnabled === "boolean" ? src.notificationsEnabled : undefined,
    sources: clampStringArray(src.sources, 500),
  };
}

module.exports = {
  clampString,
  clampNumber,
  clampStringArray,
  sanitizeArticleFilters,
  sanitizeSearchInput,
  sanitizeSavedSearchPayload,
  sanitizeWeek,
  sanitizeArticleId,
  sanitizeSavedSearchId,
  sanitizeImportanceFeedback,
  sanitizeUserFeedback,
  sanitizePreferences,
  sanitizeClusterIdValue,
  sanitizeMemoryDomain,
  sanitizeMemorySnapshotPayload,
  sanitizeDomainCollapsePayload,
};
