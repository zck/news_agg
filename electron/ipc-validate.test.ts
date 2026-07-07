// @ts-nocheck
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { clampStringArray, sanitizeScanStatePayload } = require("./ipcValidate");

const wellFormedTeachingItem = {
  id: "article-1",
  addedAt: "2026-04-18T12:00:00.000Z",
  memberIds: ["article-1", "article-2"],
  domain: "Semis",
  headline: "AI chip packaging suppliers add capacity",
  summary: "Advanced packaging capacity expands for accelerators.",
  source: "TechWire",
  url: "https://example.com/chips",
  date: "2026-04-18T09:00:00.000Z",
  tags: ["chips", "advanced_packaging"],
  impact: 8,
  confidence: "high",
  sourceCount: 3,
  articleCount: 5,
  sources: ["TechWire", "ChipDaily"],
  whyItMatters: ["Capacity constrains accelerator supply."],
  entities: [{ name: "TSMC", normalized: "tsmc", type: "company" }],
  trendDelta: 40,
  trendDir: "up",
};

describe("sanitizeScanStatePayload", () => {
  it("passes a well-formed payload through unchanged", () => {
    const payload = {
      teachingIds: ["article-1", "article-2"],
      teachingItems: [wellFormedTeachingItem],
      digest: true,
      clusterRatings: {
        "article-1|article-2": {
          interest: 4,
          ratedAt: "2026-04-18T12:00:00.000Z",
          memberIds: ["article-1", "article-2"],
        },
      },
    };

    expect(sanitizeScanStatePayload(payload)).toEqual(payload);
  });

  it("returns safe defaults for junk input", () => {
    for (const input of [undefined, null, "junk", 42, ["array"]]) {
      expect(sanitizeScanStatePayload(input)).toEqual({
        teachingIds: [],
        teachingItems: [],
        digest: false,
        clusterRatings: {},
      });
    }
  });

  it("drops teaching items without an id or headline and dedupes by id", () => {
    const out = sanitizeScanStatePayload({
      teachingItems: [
        "junk",
        null,
        { id: "no-headline" },
        { headline: "no id" },
        wellFormedTeachingItem,
        { ...wellFormedTeachingItem, headline: "duplicate id is dropped" },
      ],
    });

    expect(out.teachingItems).toEqual([wellFormedTeachingItem]);
  });

  it("coerces malformed teaching item fields to safe values", () => {
    const out = sanitizeScanStatePayload({
      teachingItems: [
        {
          id: "article-9",
          headline: "Minimal entry",
          domain: "NotADomain",
          confidence: "certain",
          trendDir: "sideways",
          impact: 99,
          trendDelta: -9999,
          memberIds: "nope",
          tags: [4, "ok"],
          entities: [{ noName: true }, { name: "Acme" }],
        },
      ],
    });

    const item = out.teachingItems[0];
    expect(item.domain).toBe("General");
    expect(item.confidence).toBe("low");
    expect(item.trendDir).toBe("flat");
    expect(item.impact).toBe(10);
    expect(item.trendDelta).toBe(-1000);
    expect(item.memberIds).toEqual([]);
    expect(item.tags).toEqual(["ok"]);
    expect(item.entities).toEqual([{ name: "Acme", normalized: "acme", type: "other" }]);
    expect(typeof item.addedAt).toBe("string");
  });

  it("caps teaching items at 200 entries", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `id-${i}`,
      headline: `Story ${i}`,
    }));
    expect(sanitizeScanStatePayload({ teachingItems: many }).teachingItems).toHaveLength(200);
  });

  it("drops non-string teaching ids, clamps long ones, and caps the list at 500", () => {
    const out = sanitizeScanStatePayload({
      teachingIds: [7, null, "keep-1", { id: "x" }, "x".repeat(300)],
    });
    expect(out.teachingIds).toEqual(["keep-1", "x".repeat(256)]);

    const many = Array.from({ length: 600 }, (_, i) => `id-${i}`);
    expect(sanitizeScanStatePayload({ teachingIds: many }).teachingIds).toHaveLength(500);
  });

  it("coerces digest to a boolean", () => {
    expect(sanitizeScanStatePayload({ digest: "yes" }).digest).toBe(true);
    expect(sanitizeScanStatePayload({ digest: 0 }).digest).toBe(false);
    expect(sanitizeScanStatePayload({}).digest).toBe(false);
  });

  it("drops malformed cluster ratings", () => {
    const out = sanitizeScanStatePayload({
      clusterRatings: {
        "": { interest: 3, memberIds: ["a"] }, // empty key
        "no-interest": { memberIds: ["a"] },
        "bad-interest": { interest: "nope", memberIds: ["a"] },
        "no-members": { interest: 2, memberIds: [] },
        "bad-shape": "not-an-object",
        "ok|key": { interest: 2, memberIds: ["a", 9, "b"] },
      },
    });

    expect(Object.keys(out.clusterRatings)).toEqual(["ok|key"]);
    expect(out.clusterRatings["ok|key"].memberIds).toEqual(["a", "b"]);
  });

  it("clamps and rounds interest into the 1-4 integer range", () => {
    const interestFor = (interest) =>
      sanitizeScanStatePayload({
        clusterRatings: { key: { interest, memberIds: ["a"] } },
      }).clusterRatings.key?.interest;

    expect(interestFor(99)).toBe(4);
    expect(interestFor(0.2)).toBe(1);
    expect(interestFor(2.5)).toBe(3);
    expect(interestFor("3")).toBe(3);
  });

  it("fills ratedAt with a timestamp when missing or invalid", () => {
    const out = sanitizeScanStatePayload({
      clusterRatings: { key: { interest: 2, memberIds: ["a"], ratedAt: 12345 } },
    });

    const ratedAt = out.clusterRatings.key.ratedAt;
    expect(typeof ratedAt).toBe("string");
    expect(Number.isNaN(new Date(ratedAt).getTime())).toBe(false);
  });

  it("caps cluster ratings at 500 entries and memberIds at 50", () => {
    const ratings = {};
    for (let i = 0; i < 520; i += 1) {
      ratings[`key-${i}`] = { interest: 2, memberIds: ["a"] };
    }
    ratings["key-0"].memberIds = Array.from({ length: 60 }, (_, i) => `m-${i}`);

    const out = sanitizeScanStatePayload({ clusterRatings: ratings });
    expect(Object.keys(out.clusterRatings)).toHaveLength(500);
    expect(out.clusterRatings["key-0"].memberIds).toHaveLength(50);
  });
});

describe("clampStringArray", () => {
  it("keeps the 50-item cap and drops non-strings after delegating", () => {
    const out = clampStringArray(Array.from({ length: 80 }, (_, i) => `t-${i}`));
    expect(out).toHaveLength(50);
    expect(clampStringArray(["ok", 5, null])).toEqual(["ok"]);
    expect(clampStringArray("nope")).toEqual([]);
  });
});
