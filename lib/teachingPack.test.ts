import { describe, expect, it } from "vitest";
import type { ScanRow } from "@/lib/scanViewModel";
import type { StoryCluster } from "@/lib/types";
import {
  buildTeachingLookup,
  dedupeTeachingItems,
  findTeachingItemIdForRow,
  migrateLegacyTeachingIds,
  normalizeTeachingItems,
  teachingItemFromRow,
  teachingItemToRow,
} from "@/lib/teachingPack";

function makeRow(overrides: Partial<ScanRow> & Pick<ScanRow, "id">): ScanRow {
  return {
    clusterId: `cluster-${overrides.id}`,
    domain: "Semis",
    headline: `Headline for ${overrides.id}`,
    summary: "Summary",
    source: "TechWire",
    url: "https://example.com",
    date: "2026-06-01T00:00:00.000Z",
    tags: ["chips"],
    impact: 8,
    confidence: "high",
    sourceCount: 2,
    articleCount: 3,
    sources: ["TechWire"],
    whyItMatters: ["It matters."],
    entities: [{ name: "TSMC", normalized: "tsmc", type: "company" }],
    members: [{ id: overrides.id, src: "TechWire", t: "Headline", time: "1h ago" }],
    spark: new Array<number>(12).fill(0),
    trendDelta: 10,
    trendDir: "up",
    topTag: "chips",
    importance: 4,
    ...overrides,
  };
}

function makeCluster(id: string, articleIds: string[]): StoryCluster {
  return {
    id,
    headline: "Cluster headline",
    summary: "Cluster summary",
    whyItMatters: [],
    domain: "Semis",
    tags: [],
    entities: [],
    articleIds,
    sources: ["TechWire"],
    sourceCount: 1,
    confidence: "high",
    impactScore: 6,
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    lastSeenAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("teachingItemFromRow / teachingItemToRow", () => {
  it("snapshots a row and inflates it back into a renderable row", () => {
    const row = makeRow({
      id: "a1",
      members: [
        { id: "a1", src: "TechWire", t: "Lead", time: "1h ago" },
        { id: "a2", src: "ChipDaily", t: "Echo", time: "2h ago" },
      ],
    });
    const item = teachingItemFromRow(row, "2026-06-12T00:00:00.000Z");

    expect(item.id).toBe("a1");
    expect(item.memberIds).toEqual(["a1", "a2"]);
    expect(item.headline).toBe(row.headline);

    const inflated = teachingItemToRow(item);
    expect(inflated.headline).toBe(row.headline);
    expect(inflated.domain).toBe(row.domain);
    expect(inflated.impact).toBe(row.impact);
    expect(inflated.importance).toBe(4); // impact 8 → importance 4
    expect(inflated.spark).toHaveLength(12);
  });
});

describe("teaching lookup", () => {
  it("matches a row whose lead drifted to a different cluster member", () => {
    const savedRow = makeRow({
      id: "a1",
      members: [
        { id: "a1", src: "TechWire", t: "Lead", time: "1h ago" },
        { id: "a2", src: "ChipDaily", t: "Echo", time: "2h ago" },
      ],
    });
    const item = teachingItemFromRow(savedRow, "2026-06-12T00:00:00.000Z");
    const lookup = buildTeachingLookup([item]);

    // After a refresh, a2 became the cluster lead and a3 joined.
    const driftedRow = makeRow({
      id: "a2",
      members: [
        { id: "a2", src: "ChipDaily", t: "Echo", time: "2h ago" },
        { id: "a3", src: "Wire", t: "New", time: "1m ago" },
      ],
    });
    expect(findTeachingItemIdForRow(driftedRow, lookup)).toBe("a1");

    const unrelatedRow = makeRow({ id: "z9" });
    expect(findTeachingItemIdForRow(unrelatedRow, lookup)).toBeUndefined();
  });
});

describe("migrateLegacyTeachingIds", () => {
  it("resolves ids via lead, sampled member, or full cluster membership", () => {
    const rowA = makeRow({
      id: "a1",
      clusterId: "cluster-a",
      members: [
        { id: "a1", src: "TechWire", t: "Lead", time: "1h ago" },
        { id: "a2", src: "ChipDaily", t: "Echo", time: "2h ago" },
      ],
    });
    const rowB = makeRow({ id: "b1", clusterId: "cluster-b" });
    const clusters = [
      // a9 is in the cluster but beyond the capped members sample.
      makeCluster("cluster-a", ["a1", "a2", "a9"]),
      makeCluster("cluster-b", ["b1"]),
    ];

    const items = migrateLegacyTeachingIds(
      ["a9", "b1", "gone-id"],
      [rowA, rowB],
      clusters,
      "2026-06-12T00:00:00.000Z",
    );

    expect(items.map((i) => i.id)).toEqual(["a1", "b1"]);
    // The legacy id stays reachable for future row matching.
    expect(items[0].memberIds).toContain("a9");
  });

  it("collapses multiple legacy ids from the same cluster into one item", () => {
    const row = makeRow({
      id: "a1",
      clusterId: "cluster-a",
      members: [
        { id: "a1", src: "TechWire", t: "Lead", time: "1h ago" },
        { id: "a2", src: "ChipDaily", t: "Echo", time: "2h ago" },
      ],
    });
    const items = migrateLegacyTeachingIds(
      ["a1", "a2"],
      [row],
      [makeCluster("cluster-a", ["a1", "a2"])],
      "2026-06-12T00:00:00.000Z",
    );
    expect(items).toHaveLength(1);
  });
});

describe("normalizeTeachingItems", () => {
  it("drops junk entries and fills safe defaults", () => {
    const items = normalizeTeachingItems([
      null,
      "junk",
      { id: "no-headline" },
      { id: "ok", headline: "Valid", domain: "NotADomain", confidence: "huge" },
      { id: "ok", headline: "Duplicate" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "ok",
      headline: "Valid",
      domain: "General",
      confidence: "low",
      trendDir: "flat",
      memberIds: [],
    });
  });

  it("round-trips a snapshot unchanged", () => {
    const item = teachingItemFromRow(makeRow({ id: "a1" }), "2026-06-12T00:00:00.000Z");
    expect(normalizeTeachingItems([item])).toEqual([item]);
  });
});

describe("dedupeTeachingItems", () => {
  it("keeps the first occurrence of each id", () => {
    const a = teachingItemFromRow(makeRow({ id: "a1" }), "2026-06-12T00:00:00.000Z");
    const b = teachingItemFromRow(makeRow({ id: "b1" }), "2026-06-12T00:00:00.000Z");
    const aCopy = { ...a, headline: "Different copy" };
    expect(dedupeTeachingItems([a, b, aCopy])).toEqual([a, b]);
  });
});
