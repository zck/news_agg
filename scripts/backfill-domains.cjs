#!/usr/bin/env node

/**
 * Backfill the 14-domain taxonomy + secondary domains for existing articles.
 *
 * Usage:
 *   node scripts/backfill-domains.cjs --db /path/to/news-agg.sqlite
 *   node scripts/backfill-domains.cjs                       # uses $APP_DATA_DB if set
 *
 * Requires a running Ollama server (OLLAMA_BASE_URL, default http://localhost:11434)
 * with the model named in AI_ARTICLE_MODEL (default qwen2.5-coder:7b) pulled.
 */

const fs = require("node:fs");
const path = require("node:path");

const Database = require("better-sqlite3");

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://localhost:11434")
  .replace(/\/+$/, "")
  .replace(/\/v1$/, "");
const MODEL = process.env.AI_ARTICLE_MODEL || "qwen2.5-coder:7b";
const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE) || 6;
const BATCH_PAUSE_MS = 150;
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 180000;

const ARTICLE_DOMAINS = [
  "AIUse", "LLM", "AIInfra", "Semis", "Cloud", "Security", "Consumer", "Bio",
  "Climate", "Crypto", "Policy", "Space", "Robotics", "Batteries", "AR", "General",
];

const LEGACY_DOMAIN_REMAP = {
  AI: "LLM",
  Chips: "Semis",
  Infra: "Cloud",
  Energy: "Climate",
  Macro: "Policy",
  Frontier: "General",
};

function normalizeDomain(value) {
  if (typeof value !== "string") return "General";
  if (ARTICLE_DOMAINS.includes(value)) return value;
  return LEGACY_DOMAIN_REMAP[value] ?? "General";
}

function normalizeSecondary(primary, raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([primary]);
  const out = [];
  for (const entry of raw) {
    const normalized = normalizeDomain(entry);
    if (normalized === "General" || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 2) break;
  }
  return out;
}

function extractJson(content) {
  const trimmed = (content || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const systemPrompt = `You are a technology analyst.

Your job:
- classify each article into one PRIMARY tech domain from this fixed list:
  ${ARTICLE_DOMAINS.join(", ")}
- optionally add up to TWO SECONDARY domains from the same list (distinct from primary; omit if none fit).

Return strict JSON only, no prose. Use domain names exactly as listed.`;

const promptHint = `Respond with JSON shape:
{
  "articles": [
    { "id": "string (matches input id)", "domain": "PRIMARY", "secondary": ["optional", "optional"] }
  ]
}`;

async function classifyBatch(batch) {
  const promptInput = JSON.stringify(
    batch.map((a, idx) => ({
      id: String(idx),
      headline: a.headline,
      summary: a.summary ?? "",
      source: a.source ?? "Unknown",
      tags: a.tags ?? [],
    })),
  );

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      format: "json",
      stream: false,
      options: { temperature: 0, num_predict: 1000 },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${promptHint}\n\nArticles to classify:\n${promptInput}` },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  const parsed = extractJson(payload?.message?.content);
  const results = parsed?.articles ?? [];
  const byId = new Map();
  for (const item of results) {
    if (item && typeof item.id === "string") {
      byId.set(item.id, item);
    }
  }

  return batch.map((article, idx) => {
    const aiItem = byId.get(String(idx)) ?? results[idx];
    const primary = normalizeDomain(aiItem?.domain);
    const secondary = normalizeSecondary(primary, aiItem?.secondary);
    return { id: article.id, domain: primary, secondary };
  });
}

function resolveDbPath() {
  const argIdx = process.argv.findIndex((arg) => arg === "--db");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return path.resolve(process.argv[argIdx + 1]);
  }
  if (process.env.APP_DATA_DB) {
    return path.resolve(process.env.APP_DATA_DB);
  }
  throw new Error(
    "Provide --db <path> or set APP_DATA_DB. The Electron app shows its DB path under Settings > Open Data Folder.",
  );
}

function fetchArticleTags(db, articleIds) {
  if (!articleIds.length) return new Map();
  const placeholders = articleIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT at.article_id, t.name FROM article_tags at
       JOIN tags t ON t.id = at.tag_id
       WHERE at.article_id IN (${placeholders})`,
    )
    .all(...articleIds);
  const tagsById = new Map(articleIds.map((id) => [id, []]));
  for (const row of rows) {
    tagsById.get(row.article_id)?.push(row.name);
  }
  return tagsById;
}

async function main() {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`DB not found at ${dbPath}`);
  }

  const db = new Database(dbPath);
  const columns = db.prepare("PRAGMA table_info(articles)").all();
  const hasSecondary = columns.some((c) => c.name === "domain_secondary_json");
  if (!hasSecondary) {
    throw new Error("Migration v4 has not been applied to this DB. Launch the Electron app once to run migrations, then retry.");
  }

  const pending = db
    .prepare(
      `SELECT id, headline, summary, source, domain
       FROM articles
       WHERE domain_secondary_json IS NULL
       ORDER BY published_at DESC`,
    )
    .all();

  if (!pending.length) {
    console.log("No articles need backfilling.");
    db.close();
    return;
  }

  console.log(`Backfilling ${pending.length} articles via ${MODEL} @ ${OLLAMA_BASE_URL}...`);

  const tagsById = fetchArticleTags(db, pending.map((a) => a.id));
  const enriched = pending.map((a) => ({ ...a, tags: tagsById.get(a.id) ?? [] }));

  const update = db.prepare(
    "UPDATE articles SET domain = ?, domain_secondary_json = ? WHERE id = ?",
  );

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
    const batch = enriched.slice(i, i + BATCH_SIZE);
    try {
      const results = await classifyBatch(batch);
      const apply = db.transaction(() => {
        for (const r of results) {
          const secondaryJson = r.secondary.length ? JSON.stringify(r.secondary) : null;
          update.run(r.domain, secondaryJson, r.id);
        }
      });
      apply();
      processed += batch.length;
    } catch (error) {
      failed += batch.length;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Batch starting at ${i} failed: ${message}`);
    }

    const percent = Math.round(((i + batch.length) / enriched.length) * 100);
    process.stdout.write(`\r  ${processed}/${enriched.length} (${percent}%)`);
    if (i + BATCH_SIZE < enriched.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }
  }

  process.stdout.write("\n");
  console.log(`Done. Classified: ${processed}, Failed: ${failed}.`);
  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
