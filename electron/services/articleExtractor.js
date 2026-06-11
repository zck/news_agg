/**
 * Lightweight full-text article extractor.
 * Fetches the page HTML, strips boilerplate, and returns the article body.
 * No external dependencies — uses the same Node fetch already available.
 */

const MAX_PAGE_BYTES = 2_000_000; // 2 MB
const FETCH_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT_EXTRACTIONS = 2;
const PAUSE_BETWEEN_BATCHES_MS = 200;

// Domains that block scrapers or return paywalled content — skip extraction
const SKIP_DOMAINS = new Set([
  "arxiv.org",
  "nature.com",
  "ieee.org",
  "sciencedirect.com",
  "springer.com",
  "acm.org",
]);

function shouldSkipExtraction(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return SKIP_DOMAINS.has(hostname) || Array.from(SKIP_DOMAINS).some((d) => hostname.endsWith(`.${d}`));
  } catch {
    return true;
  }
}

function stripHtmlDeep(html) {
  return html
    // Remove scripts, styles, nav, footer, header, aside
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer\s*>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header\s*>/gi, " ")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside\s*>/gi, " ")
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Remove all tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&[a-zA-Z]+;/g, " ")
    // Collapse whitespace
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Attempt to extract the main article content from raw HTML.
 * Strategy: find <article> tag or the largest <p>-dense block.
 */
function extractArticleText(html) {
  // Try <article> tag first
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/i);
  if (articleMatch) {
    const text = stripHtmlDeep(articleMatch[1]);
    if (text.length > 200) return text;
  }

  // Try common content selectors by class/id patterns
  const contentPatterns = [
    /<div[^>]*class="[^"]*(?:article-body|post-content|entry-content|story-body|article-content|article__body|post-body|content-body)[^"]*"[^>]*>([\s\S]*?)<\/div\s*>/i,
    /<div[^>]*id="[^"]*(?:article-body|post-content|entry-content|story-body|content)[^"]*"[^>]*>([\s\S]*?)<\/div\s*>/i,
    /<main[^>]*>([\s\S]*?)<\/main\s*>/i,
  ];

  for (const pattern of contentPatterns) {
    const match = html.match(pattern);
    if (match) {
      const text = stripHtmlDeep(match[1]);
      if (text.length > 200) return text;
    }
  }

  // Fallback: extract all <p> tags and concatenate
  const paragraphs = [];
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = stripHtmlDeep(pMatch[1]);
    if (text.length > 40) {
      paragraphs.push(text);
    }
  }

  if (paragraphs.length >= 2) {
    return paragraphs.join(" ");
  }

  // Last resort: just strip everything
  const fullText = stripHtmlDeep(html);
  return fullText.length > 200 ? fullText : "";
}

async function fetchPageText(url) {
  if (!url || shouldSkipExtraction(url)) {
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TechCommandCenter/1.0; +https://github.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null;

    // Read with byte limit
    if (!response.body?.getReader) {
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_PAGE_BYTES) return null;
      return extractArticleText(text);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    let html = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();

    return extractArticleText(html);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Enrich an array of articles with full-text extraction.
 * Adds `fullText` field to each article where extraction succeeds.
 * Updates `summary` to a longer version if the original was truncated.
 */
async function enrichArticlesWithFullText(articles, {
  maxConcurrent = MAX_CONCURRENT_EXTRACTIONS,
  pauseMs = PAUSE_BETWEEN_BATCHES_MS,
} = {}) {
  const results = [...articles];

  for (let i = 0; i < results.length; i += maxConcurrent) {
    const batch = results.slice(i, i + maxConcurrent);
    const texts = await Promise.all(
      batch.map((article) => fetchPageText(article.url)),
    );

    for (let j = 0; j < batch.length; j++) {
      const fullText = texts[j];
      if (fullText && fullText.length > 100) {
        const idx = i + j;
        results[idx] = {
          ...results[idx],
          fullText: fullText.slice(0, 5000), // Cap storage at 5k chars
        };
        // If the RSS summary was truncated (≤280 chars), upgrade it
        if (!results[idx].summary || results[idx].summary.length < 300) {
          // Take first ~600 chars ending at a sentence boundary
          const upgraded = fullText.slice(0, 800);
          const lastPeriod = upgraded.lastIndexOf(". ");
          results[idx].summary = lastPeriod > 200
            ? upgraded.slice(0, lastPeriod + 1)
            : upgraded.slice(0, 600);
        }
      }
    }

    if (i + maxConcurrent < results.length && pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  return results;
}

module.exports = {
  enrichArticlesWithFullText,
  extractArticleText,
  fetchPageText,
  shouldSkipExtraction,
};
