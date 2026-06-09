import { NextRequest, NextResponse } from "next/server";
import { clusterArticles } from "@/lib/clustering";
import { formatWeek } from "@/lib/ingest";
import { generateWhyItMatters } from "@/lib/why-it-matters";
import { Article, ArticleDomain } from "@/lib/types";

const domains: ArticleDomain[] = [
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

type IngestPayload = {
  headline?: string;
  domain?: string;
  content?: string;
  importance?: number;
};

function inferTags(source: string): string[] {
  const keywords = [
    "ai",
    "chips",
    "memory",
    "gpu",
    "data-centers",
    "power",
    "graphene",
    "batteries",
    "macro",
    "cloud",
    "inference",
  ];

  const normalized = source.toLowerCase();
  const found = keywords.filter((keyword) =>
    normalized.includes(keyword.replace("-", " ")) || normalized.includes(keyword),
  );

  return found.length ? found : ["tech", "monitoring"];
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as IngestPayload;

  if (!body.headline || !body.domain) {
    return NextResponse.json(
      { error: "headline and domain are required" },
      { status: 400 },
    );
  }

  const domain = domains.includes(body.domain as ArticleDomain)
    ? (body.domain as ArticleDomain)
    : "General";

  const sourceText = [body.headline, body.content].filter(Boolean).join(". ");
  const tags = inferTags(sourceText);

  const processedAt = new Date();
  const article: Article = {
    id: crypto.randomUUID(),
    date: processedAt.toISOString().slice(0, 10),
    processed_at: processedAt.toISOString(),
    week: formatWeek(processedAt),
    domain,
    headline: body.headline,
    summary:
      body.content?.slice(0, 180) ||
      `Mock summary: ${body.headline} is being processed into the daily dashboard with lightweight signal extraction.`,
    tags,
    importance:
      body.importance && body.importance >= 1 && body.importance <= 5
        ? (body.importance as Article["importance"])
        : 3,
  };
  const clusters = clusterArticles([article]);
  const cluster = clusters[0]
    ? {
        ...clusters[0],
        whyItMatters: await generateWhyItMatters(clusters[0], [article]),
      }
    : null;

  return NextResponse.json({
    article,
    cluster,
    storyClusters: cluster ? [cluster] : [],
    clusters: cluster ? [cluster] : [],
  });
}
