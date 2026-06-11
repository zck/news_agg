const defaultPreferences = {
  refreshIntervalMinutes: 30,
  notificationsEnabled: true,
  notificationImportanceThreshold: 5,
  personalizedDefault: false,
};

const defaultScanState = {
  teachingIds: [],
  digest: false,
  clusterRatings: {},
  updatedAt: null,
};

function safeParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function getPreference(db, key, fallback = null) {
  const row = db.prepare("SELECT value_json FROM preferences WHERE key = ?").get(key);
  return row ? safeParse(row.value_json, fallback) : fallback;
}

function savePreference(db, key, value) {
  db.prepare(`
    INSERT INTO preferences (key, value_json)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run(key, JSON.stringify(value));
}

function getPreferences(db) {
  const stored = getPreference(db, "settings", {});
  return {
    ...defaultPreferences,
    ...(stored && typeof stored === "object" ? stored : {}),
  };
}

function savePreferences(db, next) {
  const current = getPreferences(db);
  const sanitized = { ...current };

  if (Number.isFinite(Number(next.refreshIntervalMinutes))) {
    sanitized.refreshIntervalMinutes = Math.max(
      5,
      Math.min(240, Math.floor(Number(next.refreshIntervalMinutes))),
    );
  }

  if (typeof next.notificationsEnabled === "boolean") {
    sanitized.notificationsEnabled = next.notificationsEnabled;
  }

  if (Number.isFinite(Number(next.notificationImportanceThreshold))) {
    sanitized.notificationImportanceThreshold = Math.max(
      1,
      Math.min(5, Math.floor(Number(next.notificationImportanceThreshold))),
    );
  }

  if (typeof next.personalizedDefault === "boolean") {
    sanitized.personalizedDefault = next.personalizedDefault;
  }

  savePreference(db, "settings", sanitized);
  return sanitized;
}

function getLastRefresh(db) {
  return getPreference(db, "lastRefresh", null);
}

function setLastRefresh(db, value) {
  savePreference(db, "lastRefresh", value);
}

function getLastRefreshError(db) {
  return getPreference(db, "lastRefreshError", null);
}

function setLastRefreshError(db, value) {
  if (value) {
    savePreference(db, "lastRefreshError", value);
    return;
  }

  db.prepare("DELETE FROM preferences WHERE key = ?").run("lastRefreshError");
}

function getLastRefreshStats(db) {
  return getPreference(db, "lastRefreshStats", null);
}

function setLastRefreshStats(db, value) {
  if (value) {
    savePreference(db, "lastRefreshStats", value);
    return;
  }

  db.prepare("DELETE FROM preferences WHERE key = ?").run("lastRefreshStats");
}

function getScanState(db) {
  const stored = getPreference(db, "scanState", defaultScanState);
  return {
    ...defaultScanState,
    ...(stored && typeof stored === "object" ? stored : {}),
  };
}

function saveScanState(db, next) {
  const state = {
    teachingIds: Array.isArray(next?.teachingIds) ? next.teachingIds : [],
    digest: Boolean(next?.digest),
    clusterRatings:
      next?.clusterRatings && typeof next.clusterRatings === "object"
        ? next.clusterRatings
        : {},
    updatedAt: new Date().toISOString(),
  };
  savePreference(db, "scanState", state);
  return state;
}

function getImportanceFeedback(db) {
  const rows = db.prepare(`
    SELECT article_id, original_importance, user_importance, updated_at
    FROM importance_feedback
    ORDER BY updated_at DESC
  `).all();
  const feedback = {};

  for (const row of rows) {
    feedback[row.article_id] = {
      articleId: row.article_id,
      originalImportance: row.original_importance,
      userImportance: row.user_importance,
      updatedAt: row.updated_at,
    };
  }

  return feedback;
}

function saveImportanceFeedback(db, payload) {
  if (!payload || typeof payload.articleId !== "string") {
    throw new Error("articleId is required");
  }

  if (payload.reset === true) {
    db.prepare("DELETE FROM importance_feedback WHERE article_id = ?").run(payload.articleId);
    rebuildLearningProfile(db);
    return { success: true };
  }

  const originalImportance = Number(payload.originalImportance);
  const userImportance = Number(payload.userImportance);

  if (![1, 2, 3, 4, 5].includes(originalImportance) || ![1, 2, 3, 4, 5].includes(userImportance)) {
    throw new Error("originalImportance and userImportance must be 1-5");
  }

  db.prepare(`
    INSERT INTO importance_feedback (
      article_id, original_importance, user_importance, updated_at
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(article_id) DO UPDATE SET
      original_importance = excluded.original_importance,
      user_importance = excluded.user_importance,
      updated_at = excluded.updated_at
  `).run(payload.articleId, originalImportance, userImportance, new Date().toISOString());

  rebuildLearningProfile(db);
  return { success: true };
}

function averageMap(values) {
  const result = {};

  for (const [key, value] of values.entries()) {
    result[key] = Number((value.total / Math.max(value.count, 1)).toFixed(2));
  }

  return result;
}

function rebuildLearningProfile(db) {
  const rows = db.prepare(`
    SELECT
      f.article_id,
      f.original_importance,
      f.user_importance,
      a.domain,
      t.name AS tag
    FROM importance_feedback f
    JOIN articles a ON a.id = f.article_id
    LEFT JOIN article_tags at ON at.article_id = a.id
    LEFT JOIN tags t ON t.id = at.tag_id
  `).all();
  const domainTotals = new Map();
  const tagTotals = new Map();
  const seenFeedback = new Set();

  for (const row of rows) {
    const delta = row.user_importance - row.original_importance;
    seenFeedback.add(row.article_id);

    const domain = domainTotals.get(row.domain) ?? { total: 0, count: 0 };
    domain.total += delta;
    domain.count += 1;
    domainTotals.set(row.domain, domain);

    if (row.tag) {
      const tag = tagTotals.get(row.tag) ?? { total: 0, count: 0 };
      tag.total += delta;
      tag.count += 1;
      tagTotals.set(row.tag, tag);
    }
  }

  const profile = {
    domainAdjustments: averageMap(domainTotals),
    tagAdjustments: averageMap(tagTotals),
    sampleCount: seenFeedback.size,
  };

  db.prepare(`
    INSERT INTO learning_profile (key, value_json)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run("importance", JSON.stringify(profile));

  return profile;
}

function getLearningProfile(db) {
  const row = db.prepare("SELECT value_json FROM learning_profile WHERE key = ?").get("importance");
  return safeParse(row?.value_json, {
    domainAdjustments: {},
    tagAdjustments: {},
    sampleCount: 0,
  });
}

function clearLearningProfile(db) {
  db.prepare("DELETE FROM importance_feedback").run();
  db.prepare("DELETE FROM learning_profile").run();
  return { success: true };
}

function normalizeAffinityKey(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function feedbackDelta(payload) {
  if (payload.action === "click" || payload.action === "boost") {
    return 0.5;
  }

  if (payload.action === "expand") {
    return 0.3;
  }

  if (payload.action === "suppress") {
    return -0.5;
  }

  if (payload.action === "rescore") {
    const value = Number(payload.value);
    const impactScore = Number(payload.cluster?.impactScore ?? 5);

    if (!Number.isFinite(value)) {
      return 0;
    }

    return value >= impactScore ? 1 : -1;
  }

  return 0;
}

function updateAffinity(db, payload) {
  const key = normalizeAffinityKey(payload?.key);
  const type = payload?.type === "entity" ? "entity" : "tag";
  const score = Number(payload?.score ?? payload?.delta ?? 0);
  const useAbsoluteScore = payload?.score !== undefined;

  if (!key || !Number.isFinite(score)) {
    throw new Error("key, type, and score or delta are required");
  }

  const current = db.prepare("SELECT score FROM user_affinity WHERE key = ?").get(key);
  const nextScore = useAbsoluteScore ? score : Number(current?.score ?? 0) + score;
  const updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO user_affinity (key, type, score, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      type = excluded.type,
      score = excluded.score,
      updated_at = excluded.updated_at
  `).run(key, type, Number(Math.max(-10, Math.min(10, nextScore)).toFixed(3)), updatedAt);

  return db.prepare("SELECT key, type, score, updated_at FROM user_affinity WHERE key = ?").get(key);
}

function updateAffinitiesForClusterFeedback(db, payload) {
  const delta = feedbackDelta(payload);
  const cluster = payload.cluster;

  if (!cluster || delta === 0) {
    return;
  }

  const targets = new Map();

  for (const tag of Array.isArray(cluster.tags) ? cluster.tags : []) {
    const key = normalizeAffinityKey(tag);
    if (key) {
      targets.set(`tag:${key}`, { key, type: "tag" });
    }
  }

  for (const entity of Array.isArray(cluster.entities) ? cluster.entities : []) {
    const key = normalizeAffinityKey(entity?.normalized || entity?.name);
    if (key) {
      targets.set(`entity:${key}`, { key, type: "entity" });
    }
  }

  for (const target of targets.values()) {
    updateAffinity(db, { ...target, delta });
  }
}

function saveUserFeedback(db, payload) {
  if (!payload || typeof payload.clusterId !== "string") {
    throw new Error("clusterId is required");
  }

  const action = String(payload.action ?? "");
  if (!["click", "expand", "boost", "suppress", "rescore"].includes(action)) {
    throw new Error("Unsupported feedback action");
  }

  const value = Number.isFinite(Number(payload.value)) ? Number(payload.value) : null;
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO user_feedback (cluster_id, action, value, created_at)
    VALUES (?, ?, ?, ?)
  `).run(payload.clusterId, action, value, createdAt);

  updateAffinitiesForClusterFeedback(db, { ...payload, action, value });

  return {
    success: true,
    feedback: {
      clusterId: payload.clusterId,
      action,
      value,
      createdAt,
    },
    affinities: getAffinities(db),
  };
}

function getUserFeedback(db, limit = 250) {
  return db.prepare(`
    SELECT id, cluster_id, action, value, created_at
    FROM user_feedback
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(1000, Number(limit) || 250))).map((row) => ({
    id: row.id,
    clusterId: row.cluster_id,
    action: row.action,
    value: row.value,
    createdAt: row.created_at,
  }));
}

function getAffinities(db) {
  return db.prepare(`
    SELECT key, type, score, updated_at
    FROM user_affinity
    ORDER BY ABS(score) DESC, updated_at DESC
  `).all().map((row) => ({
    key: row.key,
    type: row.type,
    score: row.score,
    updatedAt: row.updated_at,
  }));
}

function getRules(db) {
  return db.prepare(`
    SELECT id, type, field, value, weight
    FROM rules
    ORDER BY id ASC
  `).all();
}

function getPreferenceRows(db) {
  return db.prepare("SELECT * FROM preferences ORDER BY key ASC").all();
}

function getLearningRows(db) {
  return db.prepare("SELECT * FROM learning_profile ORDER BY key ASC").all();
}

function getFeedbackRows(db) {
  return db.prepare("SELECT * FROM importance_feedback ORDER BY updated_at DESC").all();
}

function getUserFeedbackRows(db) {
  return db.prepare("SELECT * FROM user_feedback ORDER BY created_at DESC").all();
}

function getAffinityRows(db) {
  return db.prepare("SELECT * FROM user_affinity ORDER BY key ASC").all();
}

function getRuleRows(db) {
  return db.prepare("SELECT * FROM rules ORDER BY id ASC").all();
}

module.exports = {
  clearLearningProfile,
  defaultScanState,
  defaultPreferences,
  getAffinityRows,
  getFeedbackRows,
  getAffinities,
  getImportanceFeedback,
  getLastRefresh,
  getLastRefreshError,
  getLastRefreshStats,
  getLearningProfile,
  getLearningRows,
  getPreference,
  getPreferenceRows,
  getPreferences,
  getRuleRows,
  getRules,
  getScanState,
  getUserFeedback,
  getUserFeedbackRows,
  rebuildLearningProfile,
  saveUserFeedback,
  saveImportanceFeedback,
  savePreference,
  savePreferences,
  saveScanState,
  setLastRefresh,
  setLastRefreshError,
  setLastRefreshStats,
  updateAffinity,
};
