// /Users/montysharma/Projects/news_agg/news_agg/lib/ingest.ts
//
// Key changes:
//   - MAX_ARTICLES_PER_SOURCE: 5 → 20
//   - MAX_DASHBOARD_ARTICLES: 30 → 300
//   - Cache duration: 1 hour → 30 minutes
//   - Summary length: 280 → 600 chars

import { processArticlesInBatches } from "@/lib/ai";
import { clusterArticles, deduplicateArticles } from "@/lib/clustering";
import { saveArticlesToDb, saveStoryClustersToDb } from "@/lib/db";
import Parser from "rss-parser";
import { fallbackArticles } from "@/lib/data";
import { sources, type RssSource } from "@/lib/sources";
import { Article, StoryCluster } from "@/lib/types";
import { synthesizeWhyItMatters } from "@/lib/story-synthesis";

const parser = new Parser();
const THIRTY_MINUTES = 30 * 60 * 1000;
const MAX_ARTICLES_PER_SOURCE = 20;
const MAX_DASHBOARD_ARTICLES = 300;
const MAX_CONCURRENT_FEEDS = 3;
const MAX_FEED_BYTES = 1_500_000;
const FEED_BATCH_PAUSE_MS = 150;

type ArticleCache = {
  articles: Article[];
  storyClusters: StoryCluster[];
  clusters: StoryCluster[];
  fetchedAt: string;
};

let articleCache: ArticleCache | null = null;
let ingestPromise: Promise<ArticleCache> | null = null;

export function formatWeek(value: Date) {
  const utcDate = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-${String(weekNumber).padStart(2, "0")}`;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function createSummary(item: {
  contentSnippet?: string;
  content?: string;
  summary?: string;
}) {
  const raw = item.contentSnippet || item.summary || item.content || "";
  const cleaned = stripHtml(raw);

  if (!cleaned) {
    return "Summary unavailable for this feed item.";
  }

  return cleaned.slice(0, 600);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes = MAX_FEED_BYTES,
) {
  const contentLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Feed is too large (${contentLength} bytes, limit ${maxBytes})`);
  }

  if (!response.body) {
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).byteLength;

    if (byteLength > maxBytes) {
      throw new Error(`Feed is too large (${byteLength} bytes, limit ${maxBytes})`);
    }

    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    bytesRead += value.byteLength;

    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new Error(`Feed is too large (${bytesRead} bytes, limit ${maxBytes})`);
    }

    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

function normalizeItem(source: RssSource, item: Parser.Item): Article | null {
  const headline = item.title?.trim();
  const url = item.link?.trim();

  if (!headline || !url) {
    return null;
  }

  const rawDate = item.isoDate || item.pubDate;
  const parsedDate = rawDate ? new Date(rawDate) : new Date();
  const date = parsedDate.toISOString().slice(0, 10);
  const processedAt = new Date().toISOString();

  return {
    id: `${source.name}-${headline}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    headline,
    summary: createSummary(item),
    source: source.name,
    url,
    date,
    processed_at: processedAt,
    week: formatWeek(parsedDate),
    domain: source.category,
    tags: ["uncategorized"],
    importance: 3,
  };
}

async function fetchFeed(source: RssSource) {
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
        "User-Agent": "news-agg-rss-ingestor/1.0",
      },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      console.warn(`[rss] ${source.name} failed with status ${response.status}`);
      return [];
    }

    const xml = await readResponseTextWithLimit(response);
    let feed: Parser.Output<Parser.Item>;

    try {
      feed = await parser.parseString(xml);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown parse error";
      console.warn(`[rss] ${source.name} parse failed: ${message}`);
      return [];
    }

    return (feed.items ?? [])
      .slice(0, MAX_ARTICLES_PER_SOURCE)
      .map((item) => normalizeItem(source, item))
      .filter((article): article is Article => article !== null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    console.warn(`[rss] ${source.name} failed: ${message}`);
    return [];
  }
}

async function fetchFeedsWithThrottle() {
  const results: Article[][] = [];

  for (let index = 0; index < sources.length; index += MAX_CONCURRENT_FEEDS) {
    const batch = sources.slice(index, index + MAX_CONCURRENT_FEEDS);
    results.push(...(await Promise.all(batch.map((source) => fetchFeed(source)))));

    if (index + MAX_CONCURRENT_FEEDS < sources.length) {
      await sleep(FEED_BATCH_PAUSE_MS);
    }
  }

  return results;
}

async function refreshFeeds() {
  const settled = await fetchFeedsWithThrottle();
  const deduped = deduplicateArticles(settled.flat())
    .sort((left, right) => {
      return new Date(right.date).getTime() - new Date(left.date).getTime();
    })
    .slice(0, MAX_DASHBOARD_ARTICLES);

  const enriched = await processArticlesInBatches(deduped);
  const articles = enriched.length ? enriched : fallbackArticles;
  const storyClusters = await synthesizeWhyItMatters(clusterArticles(articles), articles);

  const nextCache = {
    articles,
    storyClusters,
    clusters: storyClusters,
    fetchedAt: new Date().toISOString(),
  };

  await saveArticlesToDb(nextCache.articles);
  await saveStoryClustersToDb(nextCache.storyClusters);
  articleCache = nextCache;
  return nextCache;
}

export async function ingestFeeds() {
  if (
    articleCache &&
    Date.now() - new Date(articleCache.fetchedAt).getTime() < THIRTY_MINUTES
  ) {
    return articleCache;
  }

  if (ingestPromise) {
    return ingestPromise;
  }

  ingestPromise = refreshFeeds();

  try {
    return await ingestPromise;
  } finally {
    ingestPromise = null;
  }
}

export function getCachedArticles() {
  return articleCache;
}
