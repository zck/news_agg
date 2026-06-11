// @ts-nocheck
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const { runMigrations } = require("./migrations");
const {
  getClusterHistory,
  getDomainViewStates,
  getLatestClusterSnapshots,
  getMemoryState,
  getNarrativeThreads,
  getThreadsForClusters,
  markClusterViewed,
  markDomainViewed,
  saveNarrativeThreads,
  setDomainCollapsed,
  snapshotClusters,
} = require("./repositories/memoryRepo");

const dbs: Array<{ close: () => void }> = [];

function createDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  dbs.push(db);
  return db;
}

function sampleCluster(overrides = {}) {
  return {
    id: "cluster-1",
    headline: "AI spend keeps climbing",
    summary: "OpenAI, Google and Microsoft push bigger infra.",
    domain: "LLM",
    domainSecondary: ["Cloud"],
    tags: ["ai_infra", "capex"],
    entities: [
      { name: "OpenAI", normalized: "openai", type: "company" },
      { name: "Google", normalized: "google", type: "company" },
    ],
    articleIds: ["a1", "a2", "a3"],
    sources: ["NYT", "FT"],
    sourceCount: 2,
    confidence: "medium",
    impactScore: 7.6,
    firstSeenAt: "2026-04-10T00:00:00.000Z",
    lastSeenAt: "2026-04-20T12:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  while (dbs.length) {
    const db = dbs.pop();
    try {
      db?.close();
    } catch {
      // noop
    }
  }
});

describe("memoryRepo.snapshotClusters", () => {
  it("inserts a cluster history row with article count and summary json", () => {
    const db = createDb();
    const result = snapshotClusters(db, [sampleCluster()], {
      snapshotAt: "2026-04-20T12:00:00.000Z",
    });
    expect(result.inserted).toBe(1);

    const history = getClusterHistory(db, "cluster-1");
    expect(history).toHaveLength(1);
    expect(history[0].clusterId).toBe("cluster-1");
    expect(history[0].articleCount).toBe(3);
    expect(history[0].primaryDomain).toBe("LLM");
    expect(history[0].secondaryDomains).toEqual(["Cloud"]);
    expect(history[0].summary.headline).toContain("AI spend");
    expect(history[0].summary.tags).toEqual(["ai_infra", "capex"]);
  });

  it("trims cluster history to 50 entries per cluster", () => {
    const db = createDb();
    for (let i = 0; i < 55; i += 1) {
      snapshotClusters(
        db,
        [
          sampleCluster({
            articleIds: Array(i + 1).fill("x"),
          }),
        ],
        { snapshotAt: new Date(2026, 3, 1, i, 0, 0).toISOString() },
      );
    }
    const history = getClusterHistory(db, "cluster-1", { limit: 50 });
    expect(history).toHaveLength(50);
    // Latest should be the one with article count 55
    expect(history[0].articleCount).toBe(55);
  });

  it("skips rows with missing cluster id", () => {
    const db = createDb();
    const result = snapshotClusters(db, [
      sampleCluster(),
      { id: "", headline: "invalid" },
    ]);
    expect(result.inserted).toBe(1);
  });
});

describe("memoryRepo.getLatestClusterSnapshots", () => {
  it("returns only the latest snapshot per cluster", () => {
    const db = createDb();
    snapshotClusters(db, [sampleCluster({ articleIds: ["a"] })], {
      snapshotAt: "2026-04-18T00:00:00.000Z",
    });
    snapshotClusters(db, [sampleCluster({ articleIds: ["a", "b", "c"] })], {
      snapshotAt: "2026-04-20T00:00:00.000Z",
    });
    snapshotClusters(db, [sampleCluster({ id: "cluster-2", articleIds: ["z"] })], {
      snapshotAt: "2026-04-19T00:00:00.000Z",
    });

    const latest = getLatestClusterSnapshots(db);
    expect(latest).toHaveLength(2);
    const byId = Object.fromEntries(
      latest.map((row) => [row.clusterId, row]),
    );
    expect(byId["cluster-1"].articleCount).toBe(3);
    expect(byId["cluster-1"].snapshotAt).toBe("2026-04-20T00:00:00.000Z");
    expect(byId["cluster-2"].articleCount).toBe(1);
  });
});

describe("memoryRepo narrative threads", () => {
  it("upserts threads and preserves earliest startedAt", () => {
    const db = createDb();
    saveNarrativeThreads(db, [
      {
        id: "thread:ai|infra",
        title: "AI Infra Saga",
        startedAt: "2026-04-05T00:00:00.000Z",
        lastUpdatedAt: "2026-04-15T00:00:00.000Z",
        clusterIds: ["cluster-1", "cluster-2"],
      },
    ]);
    // Re-save with later startedAt but even later lastUpdatedAt
    saveNarrativeThreads(db, [
      {
        id: "thread:ai|infra",
        title: "AI Infra Saga v2",
        startedAt: "2026-04-10T00:00:00.000Z",
        lastUpdatedAt: "2026-04-20T00:00:00.000Z",
        clusterIds: ["cluster-3"],
      },
    ]);

    const threads = getNarrativeThreads(db);
    expect(threads).toHaveLength(1);
    expect(threads[0].startedAt).toBe("2026-04-05T00:00:00.000Z");
    expect(threads[0].lastUpdatedAt).toBe("2026-04-20T00:00:00.000Z");
    expect(threads[0].title).toBe("AI Infra Saga v2");
    expect(threads[0].clusterIds.sort()).toEqual([
      "cluster-1",
      "cluster-2",
      "cluster-3",
    ]);
  });

  it("returns cluster->thread lookup via getThreadsForClusters", () => {
    const db = createDb();
    saveNarrativeThreads(db, [
      {
        id: "thread:a",
        title: "A",
        startedAt: "2026-04-01T00:00:00.000Z",
        lastUpdatedAt: "2026-04-05T00:00:00.000Z",
        clusterIds: ["c1", "c2"],
      },
      {
        id: "thread:b",
        title: "B",
        startedAt: "2026-04-02T00:00:00.000Z",
        lastUpdatedAt: "2026-04-06T00:00:00.000Z",
        clusterIds: ["c3"],
      },
    ]);
    const map = getThreadsForClusters(db, ["c1", "c3", "missing"]);
    expect(map.c1.threadId).toBe("thread:a");
    expect(map.c3.threadId).toBe("thread:b");
    expect(map.missing).toBeUndefined();
  });
});

describe("memoryRepo view states", () => {
  it("records cluster view timestamps", () => {
    const db = createDb();
    markClusterViewed(db, "cluster-1", "2026-04-20T08:00:00.000Z");
    markClusterViewed(db, "cluster-1", "2026-04-21T08:00:00.000Z"); // later wins
    markClusterViewed(db, "cluster-2", "2026-04-19T00:00:00.000Z");
    const state = getMemoryState(db);
    expect(state.clusterViewStates["cluster-1"]).toBe(
      "2026-04-21T08:00:00.000Z",
    );
    expect(state.clusterViewStates["cluster-2"]).toBe(
      "2026-04-19T00:00:00.000Z",
    );
  });

  it("rejects invalid cluster ids", () => {
    const db = createDb();
    const result = markClusterViewed(db, "");
    expect(result.success).toBe(false);
  });

  it("markDomainViewed and setDomainCollapsed are composable", () => {
    const db = createDb();
    markDomainViewed(db, "LLM", "2026-04-20T00:00:00.000Z");
    setDomainCollapsed(db, "LLM", true, "2026-04-20T00:00:00.000Z");
    const state = getDomainViewStates(db);
    expect(state.LLM.lastViewedAt).toBe("2026-04-20T00:00:00.000Z");
    expect(state.LLM.collapsed).toBe(true);

    // Un-collapse does not reset lastViewedAt
    setDomainCollapsed(db, "LLM", false);
    const state2 = getDomainViewStates(db);
    expect(state2.LLM.collapsed).toBe(false);
    expect(state2.LLM.lastViewedAt).toBe("2026-04-20T00:00:00.000Z");
  });

  it("rejects invalid domains", () => {
    const db = createDb();
    const bad = markDomainViewed(db, "NotADomain");
    expect(bad.success).toBe(false);
    const badCollapse = setDomainCollapsed(db, "NotADomain", true);
    expect(badCollapse.success).toBe(false);
  });
});

describe("memoryRepo.getMemoryState", () => {
  it("returns combined snapshot, thread and view state in one call", () => {
    const db = createDb();
    snapshotClusters(db, [sampleCluster()], {
      snapshotAt: "2026-04-20T12:00:00.000Z",
    });
    saveNarrativeThreads(db, [
      {
        id: "thread:ai",
        title: "AI",
        startedAt: "2026-04-01T00:00:00.000Z",
        lastUpdatedAt: "2026-04-20T00:00:00.000Z",
        clusterIds: ["cluster-1"],
      },
    ]);
    markClusterViewed(db, "cluster-1", "2026-04-19T00:00:00.000Z");
    markDomainViewed(db, "LLM", "2026-04-18T00:00:00.000Z");

    const state = getMemoryState(db);
    expect(state.threads).toHaveLength(1);
    expect(state.threads[0].clusterIds).toEqual(["cluster-1"]);
    expect(state.clusterViewStates["cluster-1"]).toBe(
      "2026-04-19T00:00:00.000Z",
    );
    expect(state.domainViewStates.LLM.lastViewedAt).toBe(
      "2026-04-18T00:00:00.000Z",
    );
    expect(state.latestSnapshots["cluster-1"].articleCount).toBe(3);
    expect(state.latestSnapshots["cluster-1"].snapshotAt).toBe(
      "2026-04-20T12:00:00.000Z",
    );
  });
});
