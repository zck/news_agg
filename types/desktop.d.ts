export {};

declare global {
  type DesktopResourceImpact = {
    durationMs: number;
    cpuUserMs: number;
    cpuSystemMs: number;
    cpuTotalMs: number;
    cpuPercent: number;
    rssMb: number;
    rssDeltaMb: number;
    heapUsedMb: number;
    heapUsedDeltaMb: number;
    systemFreeMemoryMb: number;
    systemFreeMemoryDeltaMb: number;
  };

  type DesktopMemoryState = {
    constrained: boolean;
    critical?: boolean;
    severity?: "ok" | "warning" | "critical";
    reasons: string[];
    criticalReasons?: string[];
    rssMb: number;
    heapUsedMb: number;
    systemFreeMemoryMb: number;
    systemTotalMemoryMb: number;
    warningFreeMemoryMb?: number;
    minFreeMemoryMb: number;
    warningProcessRssMb?: number;
    maxProcessRssMb: number;
  };

  type DesktopPowerState = {
    source: "battery" | "external" | "unknown";
    onBattery: boolean;
    suspended?: boolean;
  };

  type DesktopOperationResult = {
    success: boolean;
    path?: string;
    count?: number;
    inserted?: number;
    updated?: number;
    incoming?: number;
    fresh?: number;
    skippedKnown?: number;
    fetchedAt?: string;
    startedAt?: string;
    completedAt?: string;
    trigger?: "manual" | "scheduled" | "launch";
    skipReason?: "battery" | "idle" | "running" | "memory";
    power?: DesktopPowerState;
    resourceImpact?: DesktopResourceImpact | null;
    error?: string;
    warning?: string;
    skipped?: boolean;
    memory?: DesktopMemoryState;
    memoryBreaks?: number;
  };

  type DesktopPreferences = {
    refreshIntervalMinutes: number;
    notificationsEnabled: boolean;
    notificationImportanceThreshold: number;
    personalizedDefault: boolean;
    appDataPath?: string;
    dbPath?: string;
    lastRefreshError?: string | null;
    lastRefreshStats?: DesktopOperationResult | null;
    learningProfile?: {
      domainAdjustments: Record<string, number>;
      tagAdjustments: Record<string, number>;
      sampleCount: number;
    };
  };

  type DesktopScanState = {
    teachingIds: string[];
    teachingItems?: import("@/lib/teachingPack").TeachingItem[];
    digest: boolean;
    clusterRatings: import("@/lib/clusterRatings").ClusterRatingStore;
    updatedAt?: string | null;
  };

  type SearchInput = {
    q: string;
    domains?: string[];
    tags?: string[];
    dateFrom?: string | null;
    dateTo?: string | null;
    minImportance?: number | null;
    personalizedOnly?: boolean;
    limit?: number;
    recordRecent?: boolean;
  };

  type SearchResult = {
    articleId: string;
    headline: string;
    summary: string;
    source: string;
    domain: string;
    importance: number;
    personalizedScore?: number;
    publishedAt: string | null;
    tags: string[];
    rank: number;
    matchSnippet?: string;
  };

  type RecentSearch = {
    id: number;
    queryText: string;
    filters: Partial<SearchInput>;
    searchedAt: string;
  };

  type SavedSearch = {
    id: number;
    name: string;
    queryText: string;
    filters: Partial<SearchInput>;
    createdAt: string;
    updatedAt: string;
  };

  type SearchStats = {
    indexedCount: number;
    articleCount: number;
    lastIndexedAt: string | null;
  };

  type DesktopMemoryThread = {
    id: string;
    title: string;
    startedAt: string;
    lastUpdatedAt: string;
    summary: { text?: string } | null;
    clusterIds: string[];
  };

  type DesktopMemoryClusterSnapshot = {
    articleCount: number;
    snapshotAt: string;
    impactScore: number | null;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
  };

  type DesktopMemoryLayerState = {
    clusterViewStates: Record<string, string>;
    domainViewStates: Record<
      string,
      { lastViewedAt: string; collapsed: boolean }
    >;
    threads: DesktopMemoryThread[];
    latestSnapshots: Record<string, DesktopMemoryClusterSnapshot>;
    error?: string;
  };

  type DesktopMemorySnapshotPayload = {
    clusters: Array<import("@/lib/types").StoryCluster>;
    threads?: Array<{
      id: string;
      title: string;
      startedAt?: string;
      lastUpdatedAt?: string;
      firstSeenAt?: string;
      lastSeenAt?: string;
      summary?: Record<string, unknown> | null;
      summaryText?: string | null;
      clusterIds: string[];
    }>;
    snapshotAt?: string;
  };

  type DesktopMemoryHistoryEntry = {
    id: number;
    clusterId: string;
    snapshotAt: string;
    articleCount: number;
    impactScore: number | null;
    primaryDomain: string | null;
    secondaryDomains: string[];
    summary: Record<string, unknown>;
  };

  interface Window {
    desktop?: {
      appInfo: () => Promise<{
        name: string;
        version: string;
        platform: string;
        dataPath?: string;
        dbPath?: string;
      }>;
      exportData: (payload: unknown) => Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>;
      ping: () => Promise<string>;
      data: {
        getTopSignals: (filters?: unknown) => Promise<unknown[]>;
        getArticles: (filters?: unknown) => Promise<import("@/lib/types").Article[]>;
        getPatterns: (filters?: unknown) => Promise<import("@/lib/patterns").PatternAnalysis>;
        getBrief: (week?: string) => Promise<import("@/lib/brief").WeeklyBrief | null>;
        getInsights: (week?: string) => Promise<import("@/lib/insights").InsightEngineResult>;
        getLongTermTrends: (filters?: { weeks?: number }) => Promise<import("@/lib/db").LongTermTrendAnalysis>;
        getImportanceFeedback: () => Promise<Record<string, import("@/lib/types").ImportanceFeedback>>;
        getUserFeedback: (limit?: number) => Promise<import("@/lib/types").UserFeedback[]>;
        getAffinities: () => Promise<import("@/lib/types").UserAffinity[]>;
        getRules: () => Promise<import("@/lib/types").PersonalizationRule[]>;
        saveUserFeedback: (payload: {
          clusterId: string;
          action: import("@/lib/types").UserFeedbackAction;
          value?: number;
          cluster?: import("@/lib/types").StoryCluster;
        }) => Promise<{
          success: boolean;
          feedback?: import("@/lib/types").UserFeedback;
          affinities?: import("@/lib/types").UserAffinity[];
          error?: string;
        }>;
        saveImportanceFeedback: (payload: {
          articleId: string;
          originalImportance?: 1 | 2 | 3 | 4 | 5;
          userImportance?: 1 | 2 | 3 | 4 | 5;
          reset?: boolean;
        }) => Promise<{ success: boolean; error?: string }>;
        clearLearningProfile: () => Promise<{ success: boolean; error?: string }>;
        getPreferences: () => Promise<DesktopPreferences>;
        savePreferences: (payload: Partial<DesktopPreferences>) => Promise<{
          success: boolean;
          preferences?: DesktopPreferences;
          error?: string;
        }>;
      };
      jobs: {
        runRefreshNow: () => Promise<DesktopOperationResult>;
        getLastRefresh: () => Promise<string | null>;
        onRefreshComplete: (callback: (payload: DesktopOperationResult) => void) => () => void;
      };
      notifications: {
        requestStatus: () => Promise<{ supported: boolean }>;
      };
      imports: {
        importJson: () => Promise<DesktopOperationResult>;
        onImportComplete: (callback: (payload: DesktopOperationResult) => void) => () => void;
      };
      exports: {
        exportJson: () => Promise<DesktopOperationResult>;
        exportRecallBookmarks: (payload: {
          html: string;
          filename: string;
        }) => Promise<DesktopOperationResult>;
        getSnapshot: () => Promise<unknown>;
      };
      search: {
        query: (input: SearchInput) => Promise<SearchResult[]>;
        relatedArticles: (articleId: string) => Promise<SearchResult[]>;
        recent: () => Promise<RecentSearch[]>;
        saveSearch: (payload: {
          name: string;
          queryText: string;
          filters?: Partial<SearchInput>;
        }) => Promise<{ success: boolean; error?: string }>;
        savedSearches: () => Promise<SavedSearch[]>;
        deleteSavedSearch: (id: number) => Promise<{ success: boolean; error?: string }>;
        rebuildIndex: () => Promise<{ success: boolean; count?: number; error?: string }>;
        stats: () => Promise<SearchStats>;
      };
      preferences: {
        onChanged: (callback: (payload: DesktopPreferences) => void) => () => void;
      };
      scan?: {
        getState: () => Promise<DesktopScanState>;
        saveState: (payload: DesktopScanState) => Promise<{
          success: boolean;
          state?: DesktopScanState;
          error?: string;
        }>;
      };
      memory: {
        getState: () => Promise<DesktopMemoryLayerState>;
        snapshotClusters: (payload: DesktopMemorySnapshotPayload) => Promise<{
          success: boolean;
          inserted?: number;
          threadsSaved?: number;
          error?: string;
        }>;
        markClusterViewed: (clusterId: string) => Promise<{
          success: boolean;
          clusterId?: string;
          lastViewedAt?: string;
          error?: string;
        }>;
        markDomainViewed: (domain: string) => Promise<{
          success: boolean;
          domain?: string;
          lastViewedAt?: string;
          error?: string;
        }>;
        setDomainCollapsed: (payload: {
          domain: string;
          collapsed: boolean;
        }) => Promise<{
          success: boolean;
          domain?: string;
          collapsed?: boolean;
          error?: string;
        }>;
        getClusterHistory: (payload: {
          clusterId: string;
          limit?: number;
        }) => Promise<DesktopMemoryHistoryEntry[]>;
      };
    };
  }
}
