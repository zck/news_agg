const fs = require("node:fs/promises");
const {
  getArticleTagRows,
  getArticles,
  getRawArticleRows,
  getTagRows,
  upsertArticles,
} = require("../repositories/articlesRepo");
const {
  getBriefRows,
  getInsightRows,
  getPatternRows,
} = require("../repositories/patternsRepo");
const {
  getAffinityRows,
  getFeedbackRows,
  getLearningRows,
  getPreferenceRows,
  getRuleRows,
  getUserFeedbackRows,
} = require("../repositories/preferencesRepo");
const { getMemoryRows } = require("../repositories/memoryRepo");

function createSnapshot(db) {
  const memory = getMemoryRows(db);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "news-agg",
    data: {
      articles: getArticles(db, { limit: 1000 }),
      articleRows: getRawArticleRows(db),
      tags: getTagRows(db),
      article_tags: getArticleTagRows(db),
      patterns: getPatternRows(db),
      briefs: getBriefRows(db),
      insights: getInsightRows(db),
      feedback: getFeedbackRows(db),
      user_feedback: getUserFeedbackRows(db),
      user_affinity: getAffinityRows(db),
      rules: getRuleRows(db),
      learning_profile: getLearningRows(db),
      preferences: getPreferenceRows(db),
      cluster_history: memory.clusterHistory,
      narrative_threads: memory.narrativeThreads,
      narrative_thread_clusters: memory.narrativeThreadClusters,
      cluster_view_state: memory.clusterViewState,
      domain_view_state: memory.domainViewState,
    },
  };
}

async function exportSnapshot(db, filePath) {
  const snapshot = createSnapshot(db);
  await fs.writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return { success: true, path: filePath, count: snapshot.data.articles.length };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_TEXT_LEN = 20000;
const MAX_TITLE_LEN = 500;
const WEEK_PATTERN = /^\d{4}-W\d{2}$|^\d{4}-\d{2}-\d{2}$/;

function clampString(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function normalizeInsight(insight) {
  if (!isObject(insight)) return null;
  const week = clampString(insight.week, 32);
  if (!week || !WEEK_PATTERN.test(week)) return null;
  const title = clampString(insight.title, MAX_TITLE_LEN);
  const explanation = clampString(insight.explanation, MAX_TEXT_LEN);
  if (!title || !explanation) return null;
  const confidence = clampString(insight.confidence, 32);
  const createdAt = clampString(insight.created_at, 64) ?? new Date().toISOString();
  return { week, title, explanation, confidence, created_at: createdAt };
}

function validateSnapshotShape(snapshot) {
  if (!isObject(snapshot)) {
    return "Import file must contain a JSON object.";
  }

  const data = isObject(snapshot.data) ? snapshot.data : snapshot;
  const articles = data.articles;

  if (articles !== undefined && !Array.isArray(articles)) {
    return "articles must be an array.";
  }

  if (!articles && !Array.isArray(data.articleRows)) {
    return "Import file must contain articles or articleRows.";
  }

  return null;
}

const MERGE_TABLE_SCHEMAS = {
  preferences: {
    keyColumns: ["key"],
    allowedColumns: ["key", "value_json"],
  },
  learning_profile: {
    keyColumns: ["key"],
    allowedColumns: ["key", "value_json"],
  },
  importance_feedback: {
    keyColumns: ["article_id"],
    allowedColumns: ["article_id", "original_importance", "user_importance", "updated_at"],
  },
  user_feedback: {
    keyColumns: ["id"],
    allowedColumns: ["id", "cluster_id", "action", "value", "created_at"],
  },
  user_affinity: {
    keyColumns: ["key"],
    allowedColumns: ["key", "type", "score", "updated_at"],
  },
  rules: {
    keyColumns: ["id"],
    allowedColumns: ["id", "type", "field", "value", "weight"],
  },
  briefs: {
    keyColumns: ["week"],
    allowedColumns: ["week", "content_json", "created_at"],
  },
  cluster_history: {
    keyColumns: ["id"],
    allowedColumns: [
      "id",
      "cluster_id",
      "snapshot_at",
      "article_count",
      "summary_json",
      "importance_score",
      "primary_domain",
      "secondary_domains_json",
    ],
  },
  narrative_threads: {
    keyColumns: ["id"],
    allowedColumns: ["id", "title", "started_at", "last_updated_at", "summary_json"],
  },
  narrative_thread_clusters: {
    keyColumns: ["thread_id", "cluster_id"],
    allowedColumns: ["thread_id", "cluster_id", "added_at"],
  },
  cluster_view_state: {
    keyColumns: ["cluster_id"],
    allowedColumns: ["cluster_id", "last_viewed_at"],
  },
  domain_view_state: {
    keyColumns: ["domain"],
    allowedColumns: ["domain", "last_viewed_at", "collapsed"],
  },
};

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeIdent(name) {
  if (typeof name !== "string" || !SAFE_IDENT.test(name)) {
    throw new Error(`Unsafe SQL identifier: ${String(name)}`);
  }
}

function mergeRawRows(db, table, rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return;
  }

  const schema = MERGE_TABLE_SCHEMAS[table];
  if (!schema) {
    throw new Error(`Table not allowed for import merge: ${table}`);
  }
  assertSafeIdent(table);

  const allowed = new Set(schema.allowedColumns);
  const columns = Object.keys(rows[0]).filter(
    (column) => allowed.has(column) && rows.every((row) => column in row),
  );

  if (!columns.length) {
    return;
  }
  columns.forEach(assertSafeIdent);
  schema.keyColumns.forEach(assertSafeIdent);

  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns
    .filter((column) => !schema.keyColumns.includes(column))
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");
  const conflict = schema.keyColumns.length
    ? `ON CONFLICT(${schema.keyColumns.join(", ")}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`
    : "";
  const statement = db.prepare(`
    INSERT INTO ${table} (${columns.join(", ")})
    VALUES (${placeholders})
    ${conflict}
  `);

  for (const row of rows) {
    statement.run(...columns.map((column) => row[column]));
  }
}

async function importSnapshot(db, filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  let snapshot;

  try {
    snapshot = JSON.parse(raw);
  } catch {
    return { success: false, error: "Selected file is not valid JSON." };
  }

  const validationError = validateSnapshotShape(snapshot);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const data = isObject(snapshot.data) ? snapshot.data : snapshot;
  const run = db.transaction(() => {
    const articleResult = upsertArticles(db, data.articles ?? data.articleRows ?? []);
    mergeRawRows(db, "preferences", data.preferences);
    mergeRawRows(db, "learning_profile", data.learning_profile);
    mergeRawRows(db, "importance_feedback", data.feedback ?? data.importance_feedback);
    mergeRawRows(db, "user_feedback", data.user_feedback);
    mergeRawRows(db, "user_affinity", data.user_affinity);
    mergeRawRows(db, "rules", data.rules);
    mergeRawRows(db, "briefs", data.briefs);
    mergeRawRows(db, "cluster_history", data.cluster_history);
    mergeRawRows(db, "narrative_threads", data.narrative_threads);
    mergeRawRows(db, "narrative_thread_clusters", data.narrative_thread_clusters);
    mergeRawRows(db, "cluster_view_state", data.cluster_view_state);
    mergeRawRows(db, "domain_view_state", data.domain_view_state);

    if (Array.isArray(data.insights)) {
      const insertInsight = db.prepare(`
        INSERT INTO insights (week, title, explanation, confidence, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          week = excluded.week,
          title = excluded.title,
          explanation = excluded.explanation,
          confidence = excluded.confidence,
          created_at = excluded.created_at
      `);
      for (const insight of data.insights) {
        const normalized = normalizeInsight(insight);
        if (!normalized) continue;
        insertInsight.run(
          normalized.week,
          normalized.title,
          normalized.explanation,
          normalized.confidence,
          normalized.created_at,
        );
      }
    }

    return articleResult;
  });
  const result = run();

  return {
    success: true,
    count: result.inserted + result.updated,
  };
}

module.exports = {
  createSnapshot,
  exportSnapshot,
  importSnapshot,
  validateSnapshotShape,
};
