const MAX_CLUSTER_HISTORY = 50;
const MAX_THREADS = 100;

const ALLOWED_DOMAINS = new Set([
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

function toIsoString(value) {
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function sanitizeClusterId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 256 ? trimmed : null;
}

function sanitizeDomain(value) {
  return typeof value === "string" && ALLOWED_DOMAINS.has(value) ? value : null;
}

function sanitizeSecondaryDomains(primary, raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(primary ? [primary] : []);
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    if (!ALLOWED_DOMAINS.has(entry)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
    if (out.length >= 2) break;
  }
  return out;
}

function summarizeCluster(cluster) {
  return {
    headline: typeof cluster.headline === "string" ? cluster.headline.slice(0, 400) : "",
    summary: typeof cluster.summary === "string" ? cluster.summary.slice(0, 600) : "",
    sources: Array.isArray(cluster.sources)
      ? cluster.sources.filter((item) => typeof item === "string").slice(0, 20)
      : [],
    sourceCount: Number.isFinite(Number(cluster.sourceCount))
      ? Number(cluster.sourceCount)
      : Array.isArray(cluster.sources)
        ? cluster.sources.length
        : 0,
    tags: Array.isArray(cluster.tags)
      ? cluster.tags.filter((item) => typeof item === "string").slice(0, 20)
      : [],
    entities: Array.isArray(cluster.entities)
      ? cluster.entities
          .filter((item) => item && typeof item.normalized === "string")
          .slice(0, 20)
          .map((item) => ({
            name: typeof item.name === "string" ? item.name : item.normalized,
            normalized: item.normalized,
            type: typeof item.type === "string" ? item.type : "other",
          }))
      : [],
    confidence: ["low", "medium", "high"].includes(cluster.confidence)
      ? cluster.confidence
      : "low",
    firstSeenAt: toIsoString(cluster.firstSeenAt),
    lastSeenAt: toIsoString(cluster.lastSeenAt),
  };
}

function snapshotClusters(db, clusters, { snapshotAt } = {}) {
  if (!Array.isArray(clusters) || !clusters.length) {
    return { inserted: 0 };
  }

  const takenAt = toIsoString(snapshotAt);

  const run = db.transaction(() => {
    let inserted = 0;
    const insert = db.prepare(`
      INSERT INTO cluster_history (
        cluster_id,
        snapshot_at,
        article_count,
        summary_json,
        importance_score,
        primary_domain,
        secondary_domains_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const trim = db.prepare(`
      DELETE FROM cluster_history
      WHERE cluster_id = ?
        AND id NOT IN (
          SELECT id FROM cluster_history
          WHERE cluster_id = ?
          ORDER BY snapshot_at DESC, id DESC
          LIMIT ?
        )
    `);

    for (const cluster of clusters) {
      const clusterId = sanitizeClusterId(cluster?.id);
      if (!clusterId) continue;

      const articleCount = Array.isArray(cluster.articleIds) ? cluster.articleIds.length : 0;
      const impactScore = Number.isFinite(Number(cluster.impactScore))
        ? Number(cluster.impactScore)
        : null;
      const primaryDomain = sanitizeDomain(cluster.domain);
      const secondary = sanitizeSecondaryDomains(primaryDomain, cluster.domainSecondary);

      insert.run(
        clusterId,
        takenAt,
        articleCount,
        JSON.stringify(summarizeCluster(cluster)),
        impactScore,
        primaryDomain,
        secondary.length ? JSON.stringify(secondary) : null,
      );
      inserted += 1;
      trim.run(clusterId, clusterId, MAX_CLUSTER_HISTORY);
    }

    return inserted;
  });

  return { inserted: run() };
}

function rowToSnapshot(row) {
  let summary = {};
  if (row.summary_json) {
    try {
      summary = JSON.parse(row.summary_json);
    } catch {
      summary = {};
    }
  }
  let secondary = [];
  if (row.secondary_domains_json) {
    try {
      secondary = JSON.parse(row.secondary_domains_json);
    } catch {
      secondary = [];
    }
  }

  return {
    id: row.id,
    clusterId: row.cluster_id,
    snapshotAt: row.snapshot_at,
    articleCount: Number(row.article_count) || 0,
    impactScore:
      row.importance_score === null || row.importance_score === undefined
        ? null
        : Number(row.importance_score),
    primaryDomain: row.primary_domain ?? null,
    secondaryDomains: Array.isArray(secondary) ? secondary : [],
    summary,
  };
}

function getClusterHistory(db, clusterId, { limit = 20 } = {}) {
  const id = sanitizeClusterId(clusterId);
  if (!id) return [];
  const capped = Math.min(Math.max(1, Number(limit) || 20), MAX_CLUSTER_HISTORY);
  const rows = db
    .prepare(
      `SELECT * FROM cluster_history
       WHERE cluster_id = ?
       ORDER BY snapshot_at DESC, id DESC
       LIMIT ?`,
    )
    .all(id, capped);
  return rows.map(rowToSnapshot);
}

function getLatestClusterSnapshots(db) {
  const rows = db
    .prepare(
      `SELECT ch.*
       FROM cluster_history ch
       INNER JOIN (
         SELECT cluster_id, MAX(snapshot_at) AS max_snap
         FROM cluster_history
         GROUP BY cluster_id
       ) latest
       ON latest.cluster_id = ch.cluster_id
       AND latest.max_snap = ch.snapshot_at`,
    )
    .all();
  return rows.map(rowToSnapshot);
}

function upsertNarrativeThread(db, thread) {
  if (!thread || typeof thread.id !== "string" || !thread.id.trim()) {
    return null;
  }

  const id = thread.id.trim().slice(0, 256);
  const title = typeof thread.title === "string" && thread.title.trim()
    ? thread.title.trim().slice(0, 400)
    : id;
  const startedAt = toIsoString(thread.startedAt ?? thread.firstSeenAt);
  const lastUpdatedAt = toIsoString(thread.lastUpdatedAt ?? thread.lastSeenAt);
  const summaryJson = thread.summary
    ? JSON.stringify(thread.summary).slice(0, 4000)
    : typeof thread.summaryText === "string"
      ? JSON.stringify({ text: thread.summaryText.slice(0, 2000) })
      : null;

  db.prepare(
    `INSERT INTO narrative_threads (id, title, started_at, last_updated_at, summary_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       started_at = MIN(narrative_threads.started_at, excluded.started_at),
       last_updated_at = MAX(narrative_threads.last_updated_at, excluded.last_updated_at),
       summary_json = COALESCE(excluded.summary_json, narrative_threads.summary_json)`,
  ).run(id, title, startedAt, lastUpdatedAt, summaryJson);

  return id;
}

function linkClusterToThread(db, threadId, clusterId, addedAt) {
  const thread = typeof threadId === "string" ? threadId.trim().slice(0, 256) : null;
  const cluster = sanitizeClusterId(clusterId);
  if (!thread || !cluster) return false;

  db.prepare(
    `INSERT INTO narrative_thread_clusters (thread_id, cluster_id, added_at)
     VALUES (?, ?, ?)
     ON CONFLICT(thread_id, cluster_id) DO NOTHING`,
  ).run(thread, cluster, toIsoString(addedAt));
  return true;
}

function saveNarrativeThreads(db, threads) {
  if (!Array.isArray(threads) || !threads.length) {
    return { saved: 0 };
  }

  const run = db.transaction(() => {
    let saved = 0;
    for (const thread of threads.slice(0, MAX_THREADS)) {
      const id = upsertNarrativeThread(db, thread);
      if (!id) continue;
      saved += 1;

      if (Array.isArray(thread.clusterIds)) {
        for (const clusterId of thread.clusterIds) {
          linkClusterToThread(db, id, clusterId, thread.lastSeenAt ?? thread.lastUpdatedAt);
        }
      }
    }
    return saved;
  });

  return { saved: run() };
}

function rowToThread(row, clusterIds = []) {
  let summary = null;
  if (row.summary_json) {
    try {
      summary = JSON.parse(row.summary_json);
    } catch {
      summary = null;
    }
  }
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    lastUpdatedAt: row.last_updated_at,
    summary,
    clusterIds,
  };
}

function getNarrativeThreads(db, { limit = MAX_THREADS } = {}) {
  const capped = Math.min(Math.max(1, Number(limit) || MAX_THREADS), MAX_THREADS);
  const rows = db
    .prepare(
      `SELECT * FROM narrative_threads
       ORDER BY last_updated_at DESC
       LIMIT ?`,
    )
    .all(capped);
  if (!rows.length) return [];

  const placeholders = rows.map(() => "?").join(",");
  const linkRows = db
    .prepare(
      `SELECT thread_id, cluster_id, added_at
       FROM narrative_thread_clusters
       WHERE thread_id IN (${placeholders})
       ORDER BY added_at ASC`,
    )
    .all(...rows.map((row) => row.id));

  const clusterMap = new Map(rows.map((row) => [row.id, []]));
  for (const link of linkRows) {
    clusterMap.get(link.thread_id)?.push(link.cluster_id);
  }

  return rows.map((row) => rowToThread(row, clusterMap.get(row.id) ?? []));
}

function getThreadsForClusters(db, clusterIds) {
  if (!Array.isArray(clusterIds) || !clusterIds.length) return {};
  const cleaned = clusterIds
    .map((value) => sanitizeClusterId(value))
    .filter((value) => value !== null);
  if (!cleaned.length) return {};

  const placeholders = cleaned.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT ntc.cluster_id, nt.id AS thread_id, nt.title, nt.started_at, nt.last_updated_at
       FROM narrative_thread_clusters ntc
       JOIN narrative_threads nt ON nt.id = ntc.thread_id
       WHERE ntc.cluster_id IN (${placeholders})`,
    )
    .all(...cleaned);

  const result = {};
  for (const row of rows) {
    const existing = result[row.cluster_id];
    if (!existing || existing.startedAt > row.started_at) {
      result[row.cluster_id] = {
        threadId: row.thread_id,
        title: row.title,
        startedAt: row.started_at,
        lastUpdatedAt: row.last_updated_at,
      };
    }
  }
  return result;
}

function markClusterViewed(db, clusterId, viewedAt) {
  const id = sanitizeClusterId(clusterId);
  if (!id) return { success: false, error: "Invalid cluster id" };
  const stamp = toIsoString(viewedAt);
  db.prepare(
    `INSERT INTO cluster_view_state (cluster_id, last_viewed_at)
     VALUES (?, ?)
     ON CONFLICT(cluster_id) DO UPDATE SET last_viewed_at = excluded.last_viewed_at`,
  ).run(id, stamp);
  return { success: true, clusterId: id, lastViewedAt: stamp };
}

function getClusterViewStates(db) {
  const rows = db.prepare("SELECT cluster_id, last_viewed_at FROM cluster_view_state").all();
  const out = {};
  for (const row of rows) {
    out[row.cluster_id] = row.last_viewed_at;
  }
  return out;
}

function markDomainViewed(db, domain, viewedAt) {
  const cleaned = sanitizeDomain(domain);
  if (!cleaned) return { success: false, error: "Invalid domain" };
  const stamp = toIsoString(viewedAt);
  db.prepare(
    `INSERT INTO domain_view_state (domain, last_viewed_at, collapsed)
     VALUES (?, ?, 0)
     ON CONFLICT(domain) DO UPDATE SET last_viewed_at = excluded.last_viewed_at`,
  ).run(cleaned, stamp);
  return { success: true, domain: cleaned, lastViewedAt: stamp };
}

function setDomainCollapsed(db, domain, collapsed, viewedAt) {
  const cleaned = sanitizeDomain(domain);
  if (!cleaned) return { success: false, error: "Invalid domain" };
  const stamp = toIsoString(viewedAt);
  const flag = collapsed ? 1 : 0;
  db.prepare(
    `INSERT INTO domain_view_state (domain, last_viewed_at, collapsed)
     VALUES (?, ?, ?)
     ON CONFLICT(domain) DO UPDATE SET collapsed = excluded.collapsed`,
  ).run(cleaned, stamp, flag);
  return { success: true, domain: cleaned, collapsed: Boolean(flag) };
}

function getDomainViewStates(db) {
  const rows = db
    .prepare("SELECT domain, last_viewed_at, collapsed FROM domain_view_state")
    .all();
  const out = {};
  for (const row of rows) {
    out[row.domain] = {
      lastViewedAt: row.last_viewed_at,
      collapsed: Boolean(row.collapsed),
    };
  }
  return out;
}

function getMemoryState(db) {
  const latestRows = getLatestClusterSnapshots(db);
  const latestByCluster = {};
  for (const snapshot of latestRows) {
    latestByCluster[snapshot.clusterId] = {
      articleCount: snapshot.articleCount,
      snapshotAt: snapshot.snapshotAt,
      impactScore: snapshot.impactScore,
      firstSeenAt: snapshot.summary?.firstSeenAt ?? null,
      lastSeenAt: snapshot.summary?.lastSeenAt ?? null,
    };
  }

  return {
    clusterViewStates: getClusterViewStates(db),
    domainViewStates: getDomainViewStates(db),
    threads: getNarrativeThreads(db),
    latestSnapshots: latestByCluster,
  };
}

function getMemoryRows(db) {
  return {
    clusterHistory: db
      .prepare("SELECT * FROM cluster_history ORDER BY cluster_id ASC, snapshot_at ASC")
      .all(),
    narrativeThreads: db
      .prepare("SELECT * FROM narrative_threads ORDER BY id ASC")
      .all(),
    narrativeThreadClusters: db
      .prepare(
        "SELECT * FROM narrative_thread_clusters ORDER BY thread_id ASC, cluster_id ASC",
      )
      .all(),
    clusterViewState: db
      .prepare("SELECT * FROM cluster_view_state ORDER BY cluster_id ASC")
      .all(),
    domainViewState: db
      .prepare("SELECT * FROM domain_view_state ORDER BY domain ASC")
      .all(),
  };
}

module.exports = {
  getClusterHistory,
  getClusterViewStates,
  getDomainViewStates,
  getLatestClusterSnapshots,
  getMemoryRows,
  getMemoryState,
  getNarrativeThreads,
  getThreadsForClusters,
  linkClusterToThread,
  markClusterViewed,
  markDomainViewed,
  saveNarrativeThreads,
  setDomainCollapsed,
  snapshotClusters,
  upsertNarrativeThread,
};
