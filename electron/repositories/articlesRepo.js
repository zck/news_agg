const MAX_LIMIT = 1000;
const { indexArticle } = require("./searchRepo");

const ARTICLE_DOMAINS = [
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

const LEGACY_DOMAIN_REMAP = {
  AI: "LLM",
  Chips: "Semis",
  Infra: "Cloud",
  Energy: "Climate",
  Macro: "Policy",
  Frontier: "General",
};

function normalizeDomainValue(value) {
  if (typeof value !== "string") return "General";
  if (ARTICLE_DOMAINS.includes(value)) return value;
  return LEGACY_DOMAIN_REMAP[value] ?? "General";
}

function normalizeSecondaryDomains(primary, raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([primary]);
  const out = [];
  for (const entry of raw) {
    const normalized = normalizeDomainValue(entry);
    if (normalized === "General") continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 2) break;
  }
  return out;
}

function isImportance(value) {
  return [1, 2, 3, 4, 5].includes(Number(value));
}

function clampLimit(value, fallback = 100) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return [...new Set(
    tags
      .filter((tag) => typeof tag === "string")
      .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "_"))
      .filter(Boolean),
  )];
}

function normalizeArticle(article) {
  const now = new Date().toISOString();
  const publishedAt =
    typeof article.published_at === "string"
      ? article.published_at
      : typeof article.date === "string"
        ? new Date(article.date).toISOString()
        : now;
  const id =
    typeof article.id === "string" && article.id.trim()
      ? article.id.trim()
      : `${article.source ?? "source"}-${article.headline ?? publishedAt}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

  const primaryDomain = normalizeDomainValue(article.domain);
  const secondaryInput =
    article.domainSecondary ?? article.domain_secondary ?? article.domain_secondary_json;
  let secondaryArray = secondaryInput;
  if (typeof secondaryInput === "string" && secondaryInput.trim()) {
    try {
      secondaryArray = JSON.parse(secondaryInput);
    } catch {
      secondaryArray = [];
    }
  }
  const domainSecondary = normalizeSecondaryDomains(primaryDomain, secondaryArray);

  return {
    id,
    headline: String(article.headline ?? "").trim(),
    summary: typeof article.summary === "string" ? article.summary : null,
    domain: primaryDomain,
    domainSecondary,
    source: typeof article.source === "string" ? article.source : null,
    url: typeof article.url === "string" && article.url.trim() ? article.url.trim() : null,
    importance: isImportance(article.importance) ? Number(article.importance) : 3,
    personalized_score:
      Number.isFinite(Number(article.personalized_score))
        ? Number(article.personalized_score)
        : null,
    published_at: publishedAt,
    processed_at:
      typeof article.processed_at === "string" ? article.processed_at : now,
    raw_payload:
      typeof article.raw_payload === "string"
        ? article.raw_payload
        : article.raw_payload
          ? JSON.stringify(article.raw_payload)
          : null,
    tags: normalizeTags(article.tags),
  };
}

function getOrCreateTag(db, name, category = null) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, "_");
  db.prepare(
    "INSERT INTO tags (name, category) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET category = COALESCE(tags.category, excluded.category)",
  ).run(normalized, category);

  return db.prepare("SELECT id, name, category FROM tags WHERE name = ?").get(normalized);
}

function articleFromRow(row, tags) {
  const primaryDomain = normalizeDomainValue(row.domain);
  let secondaryParsed = [];
  if (typeof row.domain_secondary_json === "string" && row.domain_secondary_json.trim()) {
    try {
      secondaryParsed = JSON.parse(row.domain_secondary_json);
    } catch {
      secondaryParsed = [];
    }
  }
  const domainSecondary = normalizeSecondaryDomains(primaryDomain, secondaryParsed);

  return {
    id: row.id,
    date: row.published_at ? row.published_at.slice(0, 10) : "",
    processed_at: row.processed_at ?? "",
    week: row.week ?? "",
    domain: primaryDomain,
    domainSecondary,
    headline: row.headline,
    summary: row.summary ?? "",
    source: row.source ?? undefined,
    url: row.url ?? undefined,
    tags,
    importance: isImportance(row.effective_importance)
      ? Number(row.effective_importance)
      : isImportance(row.importance)
        ? Number(row.importance)
        : 3,
    originalImportance: isImportance(row.importance) ? Number(row.importance) : 3,
    personalized_score: row.personalized_score,
  };
}

function tagsForArticles(db, articleIds) {
  if (!articleIds.length) {
    return new Map();
  }

  const placeholders = articleIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT at.article_id, t.name
    FROM article_tags at
    JOIN tags t ON t.id = at.tag_id
    WHERE at.article_id IN (${placeholders})
    ORDER BY t.name ASC
  `).all(...articleIds);
  const tags = new Map(articleIds.map((id) => [id, []]));

  for (const row of rows) {
    tags.get(row.article_id)?.push(row.name);
  }

  return tags;
}

function upsertArticle(db, input) {
  const article = normalizeArticle(input);

  if (!article.headline) {
    throw new Error("Article headline is required");
  }

  const existing = article.url
    ? db.prepare("SELECT id FROM articles WHERE url = ?").get(article.url)
    : db.prepare("SELECT id FROM articles WHERE id = ?").get(article.id);
  const articleId = existing?.id ?? article.id;
  const inserted = !existing;

  const domainSecondaryJson = article.domainSecondary.length
    ? JSON.stringify(article.domainSecondary)
    : null;

  db.prepare(`
    INSERT INTO articles (
      id, headline, summary, domain, domain_secondary_json, source, url,
      importance, personalized_score, published_at, processed_at, raw_payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      headline = excluded.headline,
      summary = excluded.summary,
      domain = excluded.domain,
      domain_secondary_json = excluded.domain_secondary_json,
      source = excluded.source,
      url = COALESCE(excluded.url, articles.url),
      importance = excluded.importance,
      personalized_score = excluded.personalized_score,
      published_at = excluded.published_at,
      processed_at = excluded.processed_at,
      raw_payload = excluded.raw_payload
  `).run(
    articleId,
    article.headline,
    article.summary,
    article.domain,
    domainSecondaryJson,
    article.source,
    article.url,
    article.importance,
    article.personalized_score,
    article.published_at,
    article.processed_at,
    article.raw_payload,
  );

  db.prepare("DELETE FROM article_tags WHERE article_id = ?").run(articleId);

  const indexedTags = article.tags.length ? article.tags : ["uncategorized"];

  for (const tagName of indexedTags) {
    const tag = getOrCreateTag(db, tagName, article.domain);
    db.prepare(
      "INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)",
    ).run(articleId, tag.id);
  }

  indexArticle(db, { ...article, id: articleId }, indexedTags);

  return { id: articleId, inserted };
}

function upsertArticles(db, articles) {
  const items = Array.isArray(articles) ? articles : [];
  const run = db.transaction(() => {
    let inserted = 0;
    let updated = 0;
    const ids = [];
    const insertedIds = [];

    for (const article of items) {
      const result = upsertArticle(db, article);
      ids.push(result.id);
      if (result.inserted) {
        inserted += 1;
        insertedIds.push(result.id);
      } else {
        updated += 1;
      }
    }

    return { inserted, updated, ids, insertedIds };
  });

  return run();
}

function getArticles(db, filters = {}) {
  const params = [];
  const where = [];
  const joins = [
    "LEFT JOIN importance_feedback f ON f.article_id = a.id",
  ];

  if (typeof filters.domain === "string" && filters.domain !== "All") {
    where.push("a.domain = ?");
    params.push(filters.domain);
  }

  if (typeof filters.tag === "string" && filters.tag.trim()) {
    joins.push("JOIN article_tags at_filter ON at_filter.article_id = a.id");
    joins.push("JOIN tags t_filter ON t_filter.id = at_filter.tag_id");
    where.push("t_filter.name = ?");
    params.push(filters.tag.trim().toLowerCase().replace(/\s+/g, "_"));
  }

  if (Number.isFinite(Number(filters.minImportance))) {
    where.push("COALESCE(f.user_importance, a.importance, 3) >= ?");
    params.push(Number(filters.minImportance));
  }

  if (typeof filters.search === "string" && filters.search.trim()) {
    where.push("(a.headline LIKE ? OR a.summary LIKE ?)");
    const query = `%${filters.search.trim()}%`;
    params.push(query, query);
  }

  const limit = clampLimit(filters.limit, 100);
  const offset = Math.max(0, Number(filters.offset) || 0);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT
      a.*,
      strftime('%Y-%W', a.published_at) AS week,
      COALESCE(f.user_importance, a.importance, 3) AS effective_importance
    FROM articles a
    ${joins.join("\n")}
    ${whereSql}
    GROUP BY a.id
    ORDER BY a.published_at DESC, a.processed_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  const tagMap = tagsForArticles(db, rows.map((row) => row.id));

  return rows.map((row) => articleFromRow(row, tagMap.get(row.id) ?? []));
}

function getTopSignals(db, filters = {}) {
  return getArticles(db, {
    ...filters,
    minImportance: filters.minImportance ?? 4,
    limit: filters.limit ?? 5,
  }).sort((left, right) => {
    const rightScore = Number(right.personalized_score ?? right.importance);
    const leftScore = Number(left.personalized_score ?? left.importance);
    return rightScore - leftScore || right.importance - left.importance;
  }).slice(0, clampLimit(filters.limit, 5));
}

// Lookup keys mirroring upsertArticle's existence checks (url first, id as
// the ON CONFLICT fallback) so the refresh pipeline can skip already-stored
// articles before extraction/enrichment.
function getKnownArticleKeys(db) {
  const rows = db.prepare("SELECT id, url FROM articles").all();
  const ids = new Set();
  const urls = new Set();

  for (const row of rows) {
    ids.add(row.id);
    if (row.url) urls.add(row.url);
  }

  return { ids, urls };
}

function getRawArticleRows(db) {
  return db.prepare("SELECT * FROM articles ORDER BY published_at DESC").all();
}

function getTagRows(db) {
  return db.prepare("SELECT * FROM tags ORDER BY name ASC").all();
}

function getArticleTagRows(db) {
  return db.prepare("SELECT * FROM article_tags ORDER BY article_id ASC, tag_id ASC").all();
}

module.exports = {
  getArticleTagRows,
  getArticles,
  getKnownArticleKeys,
  getOrCreateTag,
  getRawArticleRows,
  getTagRows,
  getTopSignals,
  normalizeArticle,
  normalizeTags,
  upsertArticle,
  upsertArticles,
};
