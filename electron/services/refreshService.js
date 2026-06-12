// Local RSS refresh pipeline for the Electron app. Feed fetching is bounded,
// full-text extraction and AI enrichment are injectable for tests, and every
// run records resource/refresh metadata in SQLite.

const Parser = require("rss-parser");
const {
  getArticles,
  getKnownArticleKeys,
  upsertArticles,
} = require("../repositories/articlesRepo");
const {
  createBrief,
  createInsights,
  formatWeek,
  getBrief,
  saveBrief,
  saveInsights,
  savePatternSnapshot,
  getPatterns,
} = require("../repositories/patternsRepo");
const {
  getPreferences,
  setLastRefresh,
  setLastRefreshError,
  setLastRefreshStats,
} = require("../repositories/preferencesRepo");
const { createResourceMonitor } = require("./resourceMonitor");
const { sources } = require("./sources");
const { enrichArticlesWithFullText } = require("./articleExtractor");
const { enrichArticlesWithAI, resetAiStatus } = require("./aiEnrichment");

const parser = new Parser();
const MAX_ARTICLES_PER_SOURCE = 20;
const MAX_TOTAL_ARTICLES = 500;
const MAX_FEED_BYTES = 1_500_000;
const MAX_CONCURRENT_FEEDS = 3;
const FEED_BATCH_PAUSE_MS = 150;
const MEMORY_COOLDOWN_PAUSE_MS = 750;

// How many articles to attempt full-text extraction on per refresh
// (prioritize newest/highest-importance first)
const MAX_EXTRACTION_ARTICLES = 80;

const HTML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_match, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&[a-zA-Z]+;/g, (entity) => HTML_ENTITIES[entity] ?? "");
}

function stripHtml(value) {
  const raw = String(value ?? "");
  const withoutScriptsAndStyles = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const decoded = decodeEntities(withoutScriptsAndStyles.replace(/<[^>]+>/g, " "));
  return decoded
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createSummary(item) {
  const cleaned = stripHtml(item.contentSnippet || item.summary || item.content || "");
  return cleaned ? cleaned.slice(0, 280) : "Summary unavailable for this feed item.";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMemoryState(memoryState) {
  if (!memoryState) {
    return "memory pressure";
  }

  const details = [
    `free ${memoryState.systemFreeMemoryMb} MB`,
    `RSS ${memoryState.rssMb} MB`,
  ];

  return `${memoryState.reasons?.join(", ") || "memory pressure"} (${details.join(", ")})`;
}

function isCriticalMemoryState(memoryState) {
  return Boolean(memoryState?.critical || memoryState?.severity === "critical");
}

async function pauseForMemory(resourceMonitor, {
  fallbackPauseMs = MEMORY_COOLDOWN_PAUSE_MS,
  maxWaitMs,
} = {}) {
  if (typeof resourceMonitor?.waitForMemoryRecovery === "function") {
    return resourceMonitor.waitForMemoryRecovery({ maxWaitMs });
  }

  await sleep(fallbackPauseMs);
  return {
    waitedMs: fallbackPauseMs,
    memoryState: resourceMonitor?.getMemoryState?.() ?? null,
  };
}

async function readResponseTextWithLimit(response, maxBytes = MAX_FEED_BYTES) {
  const contentLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Feed is too large (${contentLength} bytes, limit ${maxBytes})`);
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    const byteLength = Buffer.byteLength(text, "utf8");

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

function inferTags(text) {
  const normalized = text.toLowerCase();
  const keywords = [
    ["ai_infrastructure", ["ai infrastructure", "inference", "model serving", "gpu cluster", "training run"]],
    ["chips", ["semiconductor", "chip", "gpu", "memory chip", "wafer", "fab", "foundry", "tsmc", "asml"]],
    ["energy_constraint", ["power grid", "energy demand", "electricity", "nuclear power", "power plant"]],
    ["data_centers", ["data center", "datacenter", "cloud infrastructure", "server farm", "hyperscaler"]],
    ["frontier_models", ["frontier model", "reasoning model", "agent", "gpt-5", "claude", "gemini", "llama"]],
    ["robotics", ["robot", "robotics", "humanoid", "automation", "autonomous"]],
    ["biotech", ["biotech", "biology", "drug discovery", "genomics", "crispr", "mrna"]],
    ["security", ["security", "cyber", "vulnerability", "breach", "ransomware", "exploit", "zero-day"]],
    ["regulation", ["regulation", "policy", "antitrust", "lawmakers", "ftc", "doj", "eu commission"]],
    ["open_source", ["open source", "open-source", "apache license", "mit license"]],
    ["autonomous_vehicles", ["self-driving", "autonomous vehicle", "waymo", "cruise"]],
    ["quantum", ["quantum computer", "quantum computing", "qubit"]],
    ["funding", ["raised", "funding round", "series a", "series b", "ipo", "valuation"]],
    ["acquisition", ["acquisition", "acquired", "merger", "takeover", "buys"]],
    ["supply_chain", ["supply chain", "shortage", "tariff", "export ban", "trade war"]],
    ["developer_tools", ["developer tool", "api", "sdk", "devops", "cicd", "platform"]],
  ];
  const tags = keywords
    .filter(([, needles]) => needles.some((needle) => normalized.includes(needle)))
    .map(([tag]) => tag);

  return tags.length ? tags.slice(0, 4) : ["tech_monitoring"];
}

function scoreArticle(article, preferences) {
  const preferredTags = preferences.preferredTags ?? ["ai_infrastructure", "energy_constraint"];
  const preferredDomains = preferences.preferredDomains ?? ["LLM", "AIInfra", "Semis"];
  const tagBoost = article.tags.filter((tag) => preferredTags.includes(tag)).length * 1.2;
  const domainBoost = preferredDomains.includes(article.domain) ? 1 : 0;
  return Number((article.importance + tagBoost + domainBoost).toFixed(2));
}

function inferImportance(article) {
  const text = `${article.headline} ${article.summary}`.toLowerCase();
  let importance = 3;

  if (/(breakthrough|launches|raises|lawsuit|ban|shutdown|shortage|security|vulnerability|earnings|acquisition|billions|partnership)/.test(text)) {
    importance += 1;
  }

  if (/(openai|nvidia|google|microsoft|apple|meta|amazon|tsmc|asml|deepmind|anthropic|broadcom|intel|arm|samsung|qualcomm)/.test(text)) {
    importance += 1;
  }

  return Math.max(1, Math.min(5, importance));
}

function normalizeItem(source, item, preferences) {
  const headline = item.title?.trim();
  const url = item.link?.trim();

  if (!headline || !url) {
    return null;
  }

  const rawDate = item.isoDate || item.pubDate;
  const candidateDate = rawDate ? new Date(rawDate) : null;
  const parsedDate =
    candidateDate && !Number.isNaN(candidateDate.getTime())
      ? candidateDate
      : new Date();
  const processedAt = new Date().toISOString();
  const summary = createSummary(item);
  const tags = inferTags(`${headline} ${summary}`);
  const article = {
    id: `${source.name}-${headline}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    headline,
    summary,
    source: source.name,
    url,
    published_at: parsedDate.toISOString(),
    processed_at: processedAt,
    date: parsedDate.toISOString().slice(0, 10),
    week: formatWeek(parsedDate),
    domain: source.category,
    tags,
    raw_payload: {
      guid: item.guid,
      categories: item.categories,
      creator: item.creator,
    },
  };

  article.importance = inferImportance(article);
  article.personalized_score = scoreArticle(article, preferences);
  return article;
}

async function fetchFeed(source, preferences, { maxFeedBytes = MAX_FEED_BYTES } = {}) {
  try {
    const response = await fetch(source.url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
        "User-Agent": "news-agg-desktop/2.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { articles: [], error: `${source.name} returned ${response.status}` };
    }

    const xml = await readResponseTextWithLimit(response, maxFeedBytes);
    const feed = await parser.parseString(xml);
    const articles = (feed.items ?? [])
      .slice(0, MAX_ARTICLES_PER_SOURCE)
      .map((item) => normalizeItem(source, item, preferences))
      .filter(Boolean);

    return { articles, error: null };
  } catch (error) {
    return {
      articles: [],
      error: `${source.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

function dedupeByUrl(articles) {
  const seen = new Set();

  return articles.filter((article) => {
    const key = article.url || article.headline.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function fetchAllFeeds(preferences, {
  sourceList = sources,
  maxConcurrentFeeds = MAX_CONCURRENT_FEEDS,
  maxFeedBytes = MAX_FEED_BYTES,
  batchPauseMs = FEED_BATCH_PAUSE_MS,
  memoryCooldownPauseMs = MEMORY_COOLDOWN_PAUSE_MS,
  resourceMonitor,
  fetchFeedFn = fetchFeed,
} = {}) {
  const results = [];
  const concurrency = Math.max(1, Number(maxConcurrentFeeds) || 1);
  let memoryBreaks = 0;

  for (let index = 0; index < sourceList.length; index += concurrency) {
    const memoryState = resourceMonitor?.getMemoryState?.();
    let batchConcurrency = concurrency;

    if (memoryState?.constrained) {
      memoryBreaks += 1;
      const recovered = await pauseForMemory(resourceMonitor, {
        fallbackPauseMs: memoryCooldownPauseMs,
      });

      if (isCriticalMemoryState(recovered.memoryState)) {
        const message = `Refresh stopped early because ${formatMemoryState(recovered.memoryState)}`;
        results.push(
          ...sourceList.slice(index).map((source) => ({
            articles: [],
            error: `${source.name}: ${message}`,
          })),
        );
        break;
      }

      batchConcurrency = 1;
    }

    const batch = sourceList.slice(index, index + batchConcurrency);
    results.push(
      ...(await Promise.all(
        batch.map((source) => fetchFeedFn(source, preferences, { maxFeedBytes })),
      )),
    );

    if (batchPauseMs > 0 && index + batchConcurrency < sourceList.length) {
      await sleep(memoryState?.constrained ? Math.max(batchPauseMs, memoryCooldownPauseMs) : batchPauseMs);
    }

    if (batchConcurrency !== concurrency) {
      index -= concurrency - batchConcurrency;
    }
  }

  if (memoryBreaks > 0) {
    Object.defineProperty(results, "memoryBreaks", {
      value: memoryBreaks,
      enumerable: false,
    });
  }

  return results;
}

function createRefreshService({
  db,
  notificationService,
  onComplete,
  fetchAllFeeds: fetchAllFeedsOverride,
  fullTextEnricher = enrichArticlesWithFullText,
  aiEnricher = enrichArticlesWithAI,
  resetAiAvailability = resetAiStatus,
  maxExtractionArticles = MAX_EXTRACTION_ARTICLES,
  getPowerState,
  resourceMonitor = createResourceMonitor(),
  shouldSuspendRefresh = (_options, powerState) => Boolean(powerState?.onBattery),
} = {}) {
  let runningPromise = null;

  async function runRefresh(options = {}) {
    if (runningPromise) {
      return {
        success: false,
        skipped: true,
        skipReason: "running",
        inserted: 0,
        updated: 0,
        incoming: 0,
        error: "Refresh already running",
      };
    }

    runningPromise = (async () => {
      const trigger = options.manual ? "manual" : options.scheduled ? "scheduled" : "launch";
      const powerState = getPowerState?.() ?? { source: "unknown", onBattery: false };
      const startedAt = new Date().toISOString();

      // shouldSuspendRefresh may return a boolean (legacy: battery) or a
      // reason string ("battery" | "idle").
      const suspendReason = options.manual
        ? null
        : shouldSuspendRefresh?.(options, powerState);
      if (suspendReason) {
        const skipReason = typeof suspendReason === "string" ? suspendReason : "battery";
        const skippedAt = new Date().toISOString();
        const result = {
          success: false,
          skipped: true,
          skipReason,
          inserted: 0,
          updated: 0,
          incoming: 0,
          fetchedAt: skippedAt,
          startedAt,
          completedAt: skippedAt,
          trigger,
          power: {
            ...powerState,
            suspended: true,
          },
          error:
            skipReason === "idle"
              ? "Auto-refresh paused while this computer is idle"
              : "Auto-refresh paused while this computer is on battery power",
        };
        setLastRefreshStats(db, result);
        return result;
      }

      let memoryState = resourceMonitor?.getMemoryState?.();
      let memoryBreaks = 0;

      if (memoryState?.constrained) {
        const recovered = await pauseForMemory(resourceMonitor, {
          maxWaitMs: options.manual ? 3500 : 1500,
        });
        memoryState = recovered.memoryState;
        memoryBreaks += 1;

        if (isCriticalMemoryState(memoryState)) {
          const skippedAt = new Date().toISOString();
          const result = {
            success: false,
            skipped: true,
            skipReason: "memory",
            inserted: 0,
            updated: 0,
            incoming: 0,
            fetchedAt: skippedAt,
            startedAt,
            completedAt: skippedAt,
            trigger,
            power: powerState,
            memory: memoryState,
            memoryBreaks,
            error: `Refresh paused because ${formatMemoryState(memoryState)}`,
          };
          setLastRefreshStats(db, result);
          return result;
        }
      }

      const resourceSample = resourceMonitor?.start?.();

      function complete(result) {
        const completedAt = new Date().toISOString();
        const nextResult = {
          ...result,
          incoming: result.incoming ?? 0,
          fetchedAt: result.fetchedAt ?? completedAt,
          startedAt,
          completedAt,
          trigger,
          power: result.power ?? powerState,
          resourceImpact: resourceMonitor?.finish?.(resourceSample) ?? null,
        };
        setLastRefreshStats(db, nextResult);
        return nextResult;
      }

      // Reset AI status so it re-checks availability each cycle.
      resetAiAvailability();

      const preferences = getPreferences(db);
      const settled = await (fetchAllFeedsOverride ?? fetchAllFeeds)(preferences, {
        resourceMonitor,
      });
      memoryBreaks += Number(settled.memoryBreaks ?? 0);

      const fetched = dedupeByUrl(settled.flatMap((result) => result.articles));
      const errors = settled.map((result) => result.error).filter(Boolean);

      if (!fetched.length && errors.length) {
        const message = `Refresh failed: ${errors.slice(0, 3).join("; ")}`;
        setLastRefreshError(db, message);
        return complete({
          success: false,
          inserted: 0,
          updated: 0,
          incoming: 0,
          error: message,
        });
      }

      // Incremental refresh: feeds mostly re-serve articles we already hold
      // (last measured: 478 of 500). Re-running extraction + AI enrichment on
      // them redid ~95% of the work every cycle and overwrote prior AI output
      // on failure, so only never-seen articles continue down the pipeline.
      const known = getKnownArticleKeys(db);
      const freshArticles = fetched.filter(
        (article) =>
          !(article.url && known.urls.has(article.url)) && !known.ids.has(article.id),
      );
      const skippedKnown = fetched.length - freshArticles.length;
      let articles = freshArticles
        .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())
        .slice(0, MAX_TOTAL_ARTICLES);

      // Full-text extraction on top articles.
      const sortedForExtraction = [...articles]
        .sort((a, b) => (b.importance - a.importance) || (new Date(b.published_at).getTime() - new Date(a.published_at).getTime()));
      const extractionLimit = Math.max(0, Number(maxExtractionArticles) || 0);
      const toExtract = sortedForExtraction.slice(0, extractionLimit);
      const skipExtract = sortedForExtraction.slice(extractionLimit);

      if (toExtract.length && fullTextEnricher) {
        try {
          const extracted = await fullTextEnricher(toExtract);
          articles = [...extracted, ...skipExtract];
          console.log(`[refresh] Full-text extraction completed for ${toExtract.length} articles`);
        } catch (extractError) {
          console.warn(`[refresh] Full-text extraction failed: ${extractError instanceof Error ? extractError.message : "Unknown"}`);
        }
      }

      // AI enrichment for domain, tags, importance, and summary. Skipped
      // entirely when nothing is new so a no-op refresh never loads the model.
      if (articles.length && aiEnricher) {
        try {
          articles = await aiEnricher(articles);
          console.log(`[refresh] AI enrichment completed`);
        } catch (aiError) {
          console.warn(`[refresh] AI enrichment failed: ${aiError instanceof Error ? aiError.message : "Unknown"}`);
        }
      }

      // Save and generate patterns/briefs.
      const result = upsertArticles(db, articles);
      const latestArticles = getArticles(db, { limit: 500 });
      const patterns = getPatterns(db, { limit: 500 });
      const week = formatWeek(new Date());
      savePatternSnapshot(db, patterns, week);

      const brief = getBrief(db, week) ?? createBrief(patterns, latestArticles);
      saveBrief(db, week, brief);

      const insights = createInsights(patterns, latestArticles);
      saveInsights(db, week, insights);

      const insertedArticles = latestArticles.filter((article) =>
        result.insertedIds.includes(article.id),
      );
      const notificationCount = notificationService
        ? notificationService.notifyImportantArticles(insertedArticles, preferences)
        : 0;
      const refreshedAt = new Date().toISOString();
      setLastRefresh(db, refreshedAt);
      setLastRefreshError(db, null);

      return complete({
        success: true,
        inserted: result.inserted,
        updated: result.updated,
        incoming: fetched.length,
        fresh: articles.length,
        skippedKnown,
        notificationCount,
        fetchedAt: refreshedAt,
        warning: errors.length ? errors.slice(0, 3).join("; ") : undefined,
        memoryBreaks,
        memory: memoryState?.constrained ? memoryState : undefined,
        manual: Boolean(options.manual),
      });
    })();

    try {
      const result = await runningPromise;
      if (onComplete) {
        try {
          onComplete(result);
        } catch (callbackError) {
          console.error("[refreshService] onComplete callback threw:", callbackError);
        }
      }
      return result;
    } finally {
      runningPromise = null;
    }
  }

  function isRunning() {
    return Boolean(runningPromise);
  }

  return {
    isRunning,
    runRefresh,
  };
}

module.exports = {
  createRefreshService,
  fetchAllFeeds,
  fetchFeed,
  inferTags,
  normalizeItem,
};
