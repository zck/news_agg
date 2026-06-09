// /Users/montysharma/Projects/news_agg/news_agg/electron/services/aiEnrichment.js

/**
 * AI enrichment for the Electron desktop pipeline.
 * Calls a local Ollama instance (or compatible OpenAI-style API) to:
 *   - Generate a proper 2-sentence summary
 *   - Classify into the correct domain
 *   - Assign specific, meaningful tags
 *   - Score importance 1-5
 *
 * Falls back to heuristic enrichment if AI is unavailable.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const AI_MODEL = process.env.AI_ARTICLE_MODEL || "gemma4:26b";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 45000;
const BATCH_SIZE = 6;
const PAUSE_BETWEEN_BATCHES_MS = 300;

const ARTICLE_DOMAINS = [
  "AIUse", "LLM", "AIInfra", "Semis", "Cloud", "Security", "Consumer", "Bio",
  "Climate", "Crypto", "Policy", "Space", "Robotics",
  "Batteries", "AR", "Materials", "General",
];

const LEGACY_DOMAIN_REMAP = {
  AI: "LLM",
  Chips: "Semis",
  Infra: "Cloud",
  Energy: "Climate",
  Macro: "Policy",
  Frontier: "General",
};

const SYSTEM_PROMPT = `You are a technology analyst. For each article:
1. Write a clear 2-sentence summary capturing the key facts
2. Classify into ONE primary domain: ${ARTICLE_DOMAINS.join(", ")}
   AI is split into three: pick the best fit.
   - "LLM" = foundation model labs and their research (OpenAI, Anthropic, DeepMind, Google AI, Meta AI, Hugging Face, arxiv papers, model releases, benchmarks, agent research)
   - "AIUse" = consumer-facing AI apps, tutorials, prompt tips, what people are doing with AI, AI-assisted products
   - "AIInfra" = AI hardware and infrastructure (NVIDIA/TPU/accelerator chips, GPU clusters, training/inference infra, datacenter buildouts FOR AI, AI compute economics)
   Use "Semis" only for general chip industry news unrelated to AI workloads.
   "Materials" = materials science breakthroughs: novel alloys, polymers, ceramics, graphene/2D materials, superconductors, photovoltaics, nanomaterials. Prefer "Batteries" for energy-storage chemistry; prefer "Semis" for chip-fab process tech.
3. Optionally add up to 2 secondary domains (different from primary, omit if none fit)
4. Assign 2-4 specific lowercase tags reflecting underlying trends (NOT generic words like "ai" or "tech")
5. Rate importance 1-5:
   - 5 = industry-defining (major acquisition, breakthrough, regulation)
   - 4 = significant (large funding, product launch from major player)
   - 3 = noteworthy (interesting development, meaningful update)
   - 2 = routine (minor update, incremental progress)
   - 1 = filler (listicle, opinion without new info)

Return ONLY valid JSON, no prose.`;

function buildUserPrompt(articles) {
  const items = articles.map((a, i) => ({
    id: String(i),
    headline: a.headline,
    summary: (a.fullText || a.summary || "").slice(0, 1200),
    source: a.source || "Unknown",
  }));

  return `Respond with JSON matching this schema:
{
  "articles": [
    {
      "id": "string (matches input id)",
      "summary": "two-sentence summary",
      "domain": "one of ${ARTICLE_DOMAINS.join(", ")}",
      "secondary": ["0-2 additional domains"],
      "tags": ["2-4 specific lowercase tags"],
      "importance": 3
    }
  ]
}

Articles to analyze:
${JSON.stringify(items, null, 2)}`;
}

function extractJson(content) {
  const trimmed = content.trim();
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

function normalizeDomain(raw) {
  if (typeof raw !== "string") return "General";
  const trimmed = raw.trim();
  const match = ARTICLE_DOMAINS.find(
    (d) => d.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match;
  const remapped = LEGACY_DOMAIN_REMAP[trimmed];
  return remapped || "General";
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

function sanitizeTag(tag) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const GENERIC_TAGS = new Set([
  "ai", "technology", "startup", "news", "tech", "update",
  "report", "announcement", "article",
]);

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const normalized = [...new Set(
    tags.map(sanitizeTag).filter((t) => t && t.length > 1 && !GENERIC_TAGS.has(t)),
  )].slice(0, 4);
  return normalized.length ? normalized : ["uncategorized"];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let aiAvailable = null; // null = unknown, true/false = tested

async function checkAiAvailability() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    aiAvailable = response.ok;
  } catch {
    aiAvailable = false;
  }
  return aiAvailable;
}

async function callOllama(articles) {
  const body = {
    model: AI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(articles) },
    ],
    stream: false,
    // Thinking models (e.g. gemma4) otherwise emit reasoning into a separate
    // `thinking` field and leave `content` empty, breaking extractJson below.
    // Non-thinking models (e.g. qwen2.5) ignore this flag.
    think: false,
    format: "json",
    options: {
      temperature: 0,
      num_predict: 2000,
    },
  };

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  if (payload.error) throw new Error(`Ollama: ${payload.error}`);

  return extractJson(payload.message?.content ?? "");
}

/**
 * Enrich articles using AI. Falls back to heuristics on failure.
 * Modifies articles in-place and returns them.
 */
async function enrichArticlesWithAI(articles) {
  // Check availability once per session
  if (aiAvailable === null) {
    await checkAiAvailability();
  }

  if (!aiAvailable) {
    console.log("[ai-enrich] AI not available, using heuristic enrichment only");
    return articles;
  }

  const results = [...articles];
  let aiSuccessCount = 0;
  let aiFailCount = 0;

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);

    try {
      const parsed = await callOllama(batch);
      const aiArticles = parsed?.articles ?? [];

      // Map results back by index
      const aiByIndex = new Map();
      for (const item of aiArticles) {
        if (item && typeof item.id === "string") {
          aiByIndex.set(item.id, item);
        }
      }

      for (let j = 0; j < batch.length; j++) {
        const aiItem = aiByIndex.get(String(j)) ?? aiArticles[j];
        if (!aiItem) continue;

        const idx = i + j;
        const primary = normalizeDomain(aiItem.domain);

        results[idx] = {
          ...results[idx],
          summary: aiItem.summary && aiItem.summary.length > 20
            ? aiItem.summary
            : results[idx].summary,
          domain: primary,
          domainSecondary: normalizeSecondary(primary, aiItem.secondary),
          tags: normalizeTags(aiItem.tags),
          importance: typeof aiItem.importance === "number" &&
            aiItem.importance >= 1 && aiItem.importance <= 5
            ? Math.round(aiItem.importance)
            : results[idx].importance,
          aiEnriched: true,
        };
        aiSuccessCount++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown";
      console.warn(`[ai-enrich] Batch ${i}-${i + batch.length} failed: ${msg}`);
      aiFailCount += batch.length;

      // If we get rate limited or auth errors, stop trying
      if (msg.includes("429") || msg.includes("401") || msg.includes("404")) {
        console.warn("[ai-enrich] Disabling AI for this refresh cycle");
        aiAvailable = false;
        break;
      }
    }

    if (i + BATCH_SIZE < results.length) {
      await sleep(PAUSE_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`[ai-enrich] Enriched ${aiSuccessCount} articles via AI, ${aiFailCount} fell back to heuristics`);
  return results;
}

/**
 * Reset AI availability check (e.g., on next refresh cycle)
 */
function resetAiStatus() {
  aiAvailable = null;
}

module.exports = {
  enrichArticlesWithAI,
  checkAiAvailability,
  resetAiStatus,
};
