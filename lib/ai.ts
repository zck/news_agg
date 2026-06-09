import "server-only";

import { AI_ARTICLE_MODEL, getAIClient } from "@/lib/ai-client";
import {
  ARTICLE_DOMAINS,
  normalizeArticleDomain,
  type Article,
  type ArticleDomain,
} from "@/lib/types";

const ONE_HOUR = 60 * 60 * 1000;
const AI_FAILURE_COOLDOWN = 15 * 60 * 1000;
const MAX_PROCESSED_CACHE_ENTRIES = 300;
const GENERIC_TAGS = new Set(["ai", "technology", "startup", "news", "tech"]);

type ArticleInput = Pick<Article, "id" | "headline" | "summary" | "source">;

type ProcessedArticle = {
  clean_summary: string;
  domain: ArticleDomain;
  secondary: ArticleDomain[];
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
};

type CacheEntry = {
  expiresAt: number;
  value: ProcessedArticle;
};

const processedCache = new Map<string, CacheEntry>();
let aiDisabledUntil = 0;

const client = getAIClient();

const systemPrompt = `You are a technology analyst.

Your job:
- summarize tech news clearly in two sentences
- classify each article into one PRIMARY tech domain from this fixed list:
  AIUse, LLM, AIInfra, Semis, Cloud, Security, Consumer, Bio, Climate, Crypto, Policy, Space, Robotics, Batteries, AR, Materials, General
  (Materials = materials science: novel alloys, polymers, ceramics, graphene/2D materials, superconductors, photovoltaics, nanomaterials)
- optionally add up to TWO SECONDARY domains from the same list (distinct from the primary; omit if none fit)
- assign 1-4 tags that reflect underlying trends (lowercase, short)
- assign importance 1-5 (5 = landmark, 1 = trivial)

Return strict JSON only, no prose. Use domain names exactly as listed above.`;

function buildPromptSchemaHint() {
  return `Respond with JSON of this shape:
{
  "articles": [
    {
      "id": "string (matches input id)",
      "summary": "two-sentence summary",
      "domain": "one of ${ARTICLE_DOMAINS.join(", ")}",
      "secondary": ["up to 2 more from the same list, or empty array"],
      "tags": ["1 to 4 short lowercase tags"],
      "importance": 1
    }
  ]
}`;
}

function cacheKey(article: ArticleInput) {
  return `${article.source ?? "unknown"}::${article.headline}`.toLowerCase();
}

function pruneProcessedCache() {
  const now = Date.now();

  for (const [key, entry] of processedCache) {
    if (entry.expiresAt <= now) {
      processedCache.delete(key);
    }
  }

  while (processedCache.size > MAX_PROCESSED_CACHE_ENTRIES) {
    const oldestKey = processedCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    processedCache.delete(oldestKey);
  }
}

function setProcessedCache(key: string, value: ProcessedArticle) {
  processedCache.set(key, { value, expiresAt: Date.now() + ONE_HOUR });
  pruneProcessedCache();
}

function sentenceClamp(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "Summary unavailable for this feed item.";
  }

  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  return sentences
    .slice(0, 2)
    .map((sentence) => sentence.trim())
    .join(" ");
}

function sanitizeTag(tag: string) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeTags(tags: string[]) {
  const normalized = Array.from(
    new Set(
      tags
        .map(sanitizeTag)
        .filter((tag) => tag && !GENERIC_TAGS.has(tag)),
    ),
  ).slice(0, 4);

  return normalized.length ? normalized : ["uncategorized"];
}

function normalizeSecondary(
  primary: ArticleDomain,
  raw: unknown,
): ArticleDomain[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ArticleDomain>([primary]);
  const out: ArticleDomain[] = [];
  for (const entry of raw) {
    const normalized = normalizeArticleDomain(entry);
    if (normalized === "General") continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= 2) break;
  }
  return out;
}

function fallbackArticle(article: ArticleInput): ProcessedArticle {
  return {
    clean_summary: sentenceClamp(article.summary ?? ""),
    domain: "General",
    secondary: [],
    tags: ["uncategorized"],
    importance: 3,
  };
}

function extractJson(content: string): unknown {
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

export async function processArticle(article: ArticleInput): Promise<ProcessedArticle> {
  const key = cacheKey(article);
  const cached = processedCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const dummyArticle = {
    ...article,
    id: article.id ?? cacheKey(article),
    date: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    week: "now",
    domain: "General" as ArticleDomain,
    tags: [],
    importance: 3,
  } as Article;

  const results = await processArticlesInBatches([dummyArticle]);
  const first = results[0];
  return {
    clean_summary: first.summary,
    domain: first.domain,
    secondary: first.domainSecondary ?? [],
    tags: first.tags,
    importance: first.importance,
  };
}

export async function processArticlesInBatches(articles: Article[]) {
  pruneProcessedCache();
  const processed = [...articles];

  for (let index = 0; index < processed.length; index += 6) {
    const slice = processed.slice(index, index + 6);

    const uncached = slice.filter((article) => {
      const key = cacheKey(article);
      const cached = processedCache.get(key);
      return !(cached && cached.expiresAt > Date.now());
    });

    if (uncached.length > 0) {
      if (!client || Date.now() < aiDisabledUntil) {
        for (const article of uncached) {
          const key = cacheKey(article);
          setProcessedCache(key, fallbackArticle(article));
        }
      } else {
        try {
          const promptInput = JSON.stringify(
            uncached.map((a, idx) => ({
              id: String(idx),
              headline: a.headline,
              summary: a.summary,
              source: a.source ?? "Unknown",
            })),
          );

          const response = await client.chat({
            model: AI_ARTICLE_MODEL,
            format: "json",
            temperature: 0,
            maxTokens: 1500,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `${buildPromptSchemaHint()}\n\nArticles to analyze:\n${promptInput}`,
              },
            ],
          });

          const parsed = extractJson(response.content) as {
            articles?: Array<{
              id?: string;
              summary?: string;
              domain?: string;
              secondary?: unknown;
              tags?: string[];
              importance?: number;
            }>;
          } | null;

          const aiResults = parsed?.articles ?? [];
          const aiByIndex = new Map<string, (typeof aiResults)[number]>();
          for (const item of aiResults) {
            if (item && typeof item.id === "string") {
              aiByIndex.set(item.id, item);
            }
          }

          for (let i = 0; i < uncached.length; i++) {
            const article = uncached[i];
            const key = cacheKey(article);
            const aiItem = aiByIndex.get(String(i)) ?? aiResults[i];

            let processedArticle: ProcessedArticle;

            if (aiItem) {
              const primary = normalizeArticleDomain(aiItem.domain);
              processedArticle = {
                clean_summary: sentenceClamp(aiItem.summary ?? article.summary),
                domain: primary,
                secondary: normalizeSecondary(primary, aiItem.secondary),
                tags: normalizeTags(Array.isArray(aiItem.tags) ? aiItem.tags : []),
                importance:
                  typeof aiItem.importance === "number" &&
                  aiItem.importance >= 1 &&
                  aiItem.importance <= 5
                    ? (Math.round(aiItem.importance) as ProcessedArticle["importance"])
                    : 3,
              };
            } else {
              processedArticle = fallbackArticle(article);
            }

            setProcessedCache(key, processedArticle);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown AI error";
          console.error(`[ai] processArticlesInBatches failed: ${message}`);

          if (
            message.includes("429") ||
            message.includes("401") ||
            message.toLowerCase().includes("quota")
          ) {
            aiDisabledUntil = Date.now() + AI_FAILURE_COOLDOWN;
          }

          for (const article of uncached) {
            const key = cacheKey(article);
            setProcessedCache(key, fallbackArticle(article));
          }
        }
      }
    }

    for (let i = index; i < index + slice.length; i++) {
      const article = processed[i];
      const key = cacheKey(article);
      const cached = processedCache.get(key)!.value;

      processed[i] = {
        ...article,
        summary: cached.clean_summary,
        domain: cached.domain,
        domainSecondary: cached.secondary,
        tags: cached.tags,
        importance: cached.importance,
      };
    }
  }

  return processed;
}
