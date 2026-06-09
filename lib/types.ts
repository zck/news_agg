export type ArticleDomain =
  | "AIUse"
  | "LLM"
  | "AIInfra"
  | "Semis"
  | "Cloud"
  | "Security"
  | "Consumer"
  | "Bio"
  | "Climate"
  | "Crypto"
  | "Policy"
  | "Space"
  | "Robotics"
  | "Batteries"
  | "AR"
  | "Materials"
  | "General";

export const ARTICLE_DOMAINS: readonly ArticleDomain[] = [
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
] as const;

export const DOMAIN_LABELS: Record<ArticleDomain, string> = {
  AIUse: "AI Use",
  LLM: "LLM",
  AIInfra: "AI Infra",
  Semis: "Semis",
  Cloud: "Cloud",
  Security: "Security",
  Consumer: "Consumer",
  Bio: "Bio",
  Climate: "Climate",
  Crypto: "Crypto",
  Policy: "Policy",
  Space: "Space",
  Robotics: "Robotics",
  Batteries: "Batteries",
  AR: "AR",
  Materials: "Materials",
  General: "General",
};

export const LEGACY_DOMAIN_REMAP: Record<string, ArticleDomain> = {
  Chips: "Semis",
  Infra: "Cloud",
  Energy: "Climate",
  Macro: "Policy",
  Frontier: "General",
  AI: "LLM",
};

export function normalizeArticleDomain(value: unknown): ArticleDomain {
  if (typeof value !== "string") return "General";
  if ((ARTICLE_DOMAINS as readonly string[]).includes(value)) {
    return value as ArticleDomain;
  }
  return LEGACY_DOMAIN_REMAP[value] ?? "General";
}

export type Article = {
  id: string;
  date: string;
  processed_at: string;
  week: string;
  domain: ArticleDomain;
  domainSecondary?: ArticleDomain[];
  headline: string;
  summary: string;
  source?: string;
  url?: string;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  originalImportance?: 1 | 2 | 3 | 4 | 5;
};

export type EntityType = "company" | "person" | "product" | "technology" | "place" | "other";

export type ExtractedEntity = {
  name: string;
  type: EntityType;
  normalized: string;
};

export type StoryCluster = {
  id: string;
  headline: string;
  summary: string;
  whyItMatters: string[];
  domain: ArticleDomain;
  domainSecondary?: ArticleDomain[];
  tags: string[];
  entities: ExtractedEntity[];
  articleIds: string[];
  sources: string[];
  sourceCount: number;
  confidence: "low" | "medium" | "high";
  impactScore: number;
  adaptiveScore?: number;
  personalizationReasons?: string[];
  preferenceAdjusted?: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type UserFeedbackAction =
  | "click"
  | "expand"
  | "boost"
  | "suppress"
  | "rescore";

export type UserFeedback = {
  id?: number;
  clusterId: string;
  action: UserFeedbackAction | string;
  value?: number | null;
  createdAt: string;
};

export type UserAffinityType = "tag" | "entity";

export type UserAffinity = {
  key: string;
  type: UserAffinityType;
  score: number;
  updatedAt: string;
};

export type PersonalizationRuleType = "boost" | "suppress" | "filter";

export type PersonalizationRuleField = "tag" | "domain" | "entity";

export type PersonalizationRule = {
  id?: number;
  type: PersonalizationRuleType;
  field: PersonalizationRuleField;
  value: string;
  weight: number;
};

export type TrendDirection = "up" | "down" | "flat";

export type TrendSignal = {
  tag: string;
  direction: TrendDirection;
  velocity: number;
  current: number;
  previous: number;
  points: Array<{ period: string; count: number }>;
};

export type NarrativeDirection = "emerging" | "growing" | "stable" | "declining";

export type NarrativeThread = {
  id: string;
  title: string;
  summary: string;
  direction: NarrativeDirection;
  tags: string[];
  entities: ExtractedEntity[];
  clusterIds: string[];
  timeline: Array<{
    clusterId: string;
    headline: string;
    impactScore: number;
    seenAt: string;
  }>;
  firstSeenAt: string;
  lastSeenAt: string;
  strength: number;
};

export type ConnectionStrength = {
  id: string;
  source: string;
  target: string;
  sourceType: "tag" | "entity";
  targetType: "tag" | "entity";
  weight: number;
  clusterIds: string[];
};

export type NarrativeInsightReport = {
  whatChanged: string[];
  emergingTrends: string[];
  keyNarratives: string[];
  crossDomainInsights: string[];
};

export type ScenarioLikelihood = "low" | "medium" | "high";

export type Scenario = {
  id: string;
  title: string;
  description: string;
  drivers: string[];
  likelihood: ScenarioLikelihood;
  timeHorizon: string;
};

export type ScenarioImplication = {
  scenarioId: string;
  consequences: string[];
  domainImpacts: Array<{
    domain: ArticleDomain | "Cross-domain";
    impact: string;
  }>;
};

export type WatchItem = {
  scenarioId: string;
  signals: string[];
  indicators: string[];
};

export type ImportanceFeedback = {
  articleId: string;
  originalImportance: 1 | 2 | 3 | 4 | 5;
  userImportance: 1 | 2 | 3 | 4 | 5;
  updatedAt: string;
};

export type ArticleWithEffectiveImportance = Article & {
  effectiveImportance?: 1 | 2 | 3 | 4 | 5;
};
