
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ReaderPane } from "@/components/scan/ReaderPane";
import { SectorRail } from "@/components/scan/SectorRail";
import { ShiftStrip } from "@/components/scan/ShiftStrip";
import { TeachingDrawer } from "@/components/scan/TeachingDrawer";
import { TerminalRow } from "@/components/scan/TerminalRow";
import { DigestRow } from "@/components/scan/DigestRow";
import { clusterArticles } from "@/lib/clustering";
import {
  clearClusterRating,
  findClusterRating,
  setClusterRating,
  type ClusterRatingStore,
} from "@/lib/clusterRatings";
import {
  loadImportanceFeedback,
  rebuildLearningProfile,
  resetUserImportance,
  saveLearningProfile,
  setUserImportance,
} from "@/lib/feedback";
import {
  buildScanViewModel,
  getDomain,
  importanceToInterest,
  interestToImportance,
  type InterestLevel,
  type ScanRow,
} from "@/lib/scanViewModel";
import type { Article, ArticleDomain, ImportanceFeedback } from "@/lib/types";

const TEACHING_STORAGE_KEY = "scan.teaching.v1";
const DIGEST_STORAGE_KEY = "scan.digest.v1";
const CLUSTER_RATING_STORAGE_KEY = "scan.cluster-rating.v1";

function readLocalStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

// Two-pass localStorage hook — avoids SSR/hydration mismatch.
function usePersisted<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [val, setVal] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setVal(JSON.parse(raw) as T);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[usePersisted] read failed", key, err);
      }
    }
    setHydrated(true);
  }, [key]);
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(val));
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[usePersisted] write failed", key, err);
      }
    }
  }, [key, val, hydrated]);
  return [val, setVal];
}

const modeBtn = (active: boolean) => ({
  border: "none",
  padding: "5px 11px",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  borderRadius: 5,
  background: active ? "#020617" : "transparent",
  color: active ? "#fff" : "#475569",
  transition: "all .12s",
});

export function ScanTerminal() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, ImportanceFeedback>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<ArticleDomain | "All">("All");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [teaching, setTeaching] = usePersisted<string[]>(TEACHING_STORAGE_KEY, []);
  const [digest, setDigest] = usePersisted<boolean>(DIGEST_STORAGE_KEY, false);
  const [desktopScanLoaded, setDesktopScanLoaded] = useState(false);
  // Cluster-keyed ratings — survive lead drift and partial cluster reshapes.
  // Display reads from this first, falling back to article-level importance
  // (which still drives the learning system).
  const [clusterRatings, setClusterRatings] = usePersisted<ClusterRatingStore>(
    CLUSTER_RATING_STORAGE_KEY,
    {},
  );

  // Refs that mirror the latest values so rateRow can read them without
  // listing articles/feedbackMap in its useCallback deps — re-binding rateRow
  // would invalidate memo'd children on every state change.
  const articlesRef = useRef<Article[]>(articles);
  const feedbackMapRef = useRef<Record<string, ImportanceFeedback>>(feedbackMap);
  useEffect(() => {
    articlesRef.current = articles;
    feedbackMapRef.current = feedbackMap;
  }, [articles, feedbackMap]);

  // ── Data loading (with error handling + stale-teaching prune) ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (typeof window !== "undefined" && window.desktop) {
        const [localArticles, storedFeedback, storedScanState] = await Promise.all([
          window.desktop.data.getArticles({ limit: 500 }),
          window.desktop.data.getImportanceFeedback(),
          window.desktop.scan?.getState() ?? Promise.resolve(null),
        ]);
        setArticles(localArticles);
        setFeedbackMap(storedFeedback);
        saveLearningProfile(rebuildLearningProfile(localArticles, storedFeedback));

        const liveIds = new Set(localArticles.map((a) => a.id));
        const localTeaching = readLocalStorageJson<string[]>(TEACHING_STORAGE_KEY, []);
        const storedTeaching = storedScanState?.teachingIds ?? [];
        const teachingSource = storedScanState?.updatedAt
          ? storedTeaching
          : uniqueIds([...storedTeaching, ...localTeaching]);
        setTeaching(teachingSource.filter((id) => liveIds.has(id)));

        if (storedScanState?.updatedAt) {
          setDigest(storedScanState.digest);
          setClusterRatings(storedScanState.clusterRatings ?? {});
        } else {
          setDigest(readLocalStorageJson<boolean>(DIGEST_STORAGE_KEY, false));
          setClusterRatings(
            readLocalStorageJson<ClusterRatingStore>(CLUSTER_RATING_STORAGE_KEY, {}),
          );
        }
        setDesktopScanLoaded(true);
      } else {
        setFeedbackMap(loadImportanceFeedback());
      }
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load articles");
    } finally {
      setLoading(false);
    }
  }, [setClusterRatings, setDigest, setTeaching]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.desktop) return;
    const unsub = window.desktop.jobs.onRefreshComplete(() => {
      void loadData();
    });
    return unsub;
  }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.desktop?.scan || !desktopScanLoaded) return;
    const timeout = window.setTimeout(() => {
      void window.desktop?.scan?.saveState({
        teachingIds: teaching,
        digest,
        clusterRatings,
      }).catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[scan] saveState failed", error);
        }
      });
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [clusterRatings, desktopScanLoaded, digest, teaching]);

  // ── View-model ──
  // Cluster grouping is O(n²) and depends only on which articles are present —
  // not on their importance values — so we memoize it on a stable id signature.
  // This way, user ratings (which mutate importance) don't trigger re-clustering;
  // re-clustering only happens when the article SET actually changes (data load).
  // Side benefit: the cluster lead stays stable within a session, so a card's
  // headline doesn't swap out from under the user when they rate it.
  const articleIdSignature = useMemo(
    () => articles.map((a) => a.id).sort().join("|"),
    [articles],
  );
  // articles is intentionally read through stale closure here — we re-cluster
  // only when articleIdSignature changes, not on every articles reference change.
  const clusters = useMemo(
    () => clusterArticles(articles),
    [articleIdSignature],
  );
  const { rows, shifts, domainStats } = useMemo(
    () => buildScanViewModel(articles, clusters),
    [articles, clusters],
  );

  // Per-row effective interest. Cluster ratings win; otherwise fall back to
  // the lead article's importance (still updated by the existing rate flow
  // for the learning system).
  const interestByRowId = useMemo(() => {
    const map = new Map<string, InterestLevel | null>();
    for (const r of rows) {
      const memberIds = r.members.map((m) => m.id);
      const match = findClusterRating(memberIds, clusterRatings);
      const interest = match
        ? match.rating.interest
        : importanceToInterest(r.importance);
      map.set(r.id, interest);
    }
    return map;
  }, [rows, clusterRatings]);

  const interestForRow = useCallback(
    (row: ScanRow): InterestLevel | null => interestByRowId.get(row.id) ?? null,
    [interestByRowId],
  );

  // O(1) teaching-pack lookup for rows.
  const teachingSet = useMemo(() => new Set(teaching), [teaching]);

  // First-load auto-select. Uses a ref so closing the reader (selectedId → null)
  // doesn't immediately re-select the first row.
  const hasAutoSelectedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoSelectedRef.current && rows.length > 0 && !selectedId) {
      hasAutoSelectedRef.current = true;
      setSelectedId(rows[0].id);
      return;
    }
    // If the selected article was deleted between loads, fall back.
    if (selectedId && !rows.some((r) => r.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? null);
    }
  }, [rows, selectedId]);

  // ── Filter / sort ──
  const filtered = useMemo(() => {
    let xs = rows;
    if (activeDomain !== "All") xs = xs.filter((r) => r.domain === activeDomain);
    if (activeTag) xs = xs.filter((r) => r.tags.includes(activeTag));
    if (digest) xs = xs.filter((r) => (interestByRowId.get(r.id) ?? 0) !== 1);
    return [...xs].sort((a, b) => {
      const ai = interestByRowId.get(a.id) ?? 0;
      const bi = interestByRowId.get(b.id) ?? 0;
      if (ai !== bi) return bi - ai;
      return b.impact - a.impact;
    });
  }, [rows, activeDomain, activeTag, digest, interestByRowId]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((r) => r.id === selectedId) ?? null;
  }, [rows, selectedId]);

  // ── Counts for the rail's "Your taste" tally ──
  const counts = useMemo(() => {
    const c = { important: 0, interesting: 0, later: 0, skip: 0, unrated: 0 };
    for (const r of rows) {
      const v = interestByRowId.get(r.id);
      if (v === 4) c.important++;
      else if (v === 3) c.interesting++;
      else if (v === 2) c.later++;
      else if (v === 1) c.skip++;
      else c.unrated++;
    }
    return c;
  }, [rows, interestByRowId]);

  // ── Rate handler — stable identity (no state in deps). Reads latest
  // articles & feedback through refs and uses functional setState. ──
  // Writes to TWO stores:
  //   1. cluster-keyed rating (display layer; survives lead drift)
  //   2. article-level feedback on the lead (learning layer; existing flow)
  const rateRow = useCallback((row: ScanRow, next: InterestLevel | null) => {
    const memberIds = row.members.map((m) => m.id);
    if (next == null) {
      // Clear cluster-level rating (matches by Jaccard if fingerprint shifted).
      setClusterRatings((prev) => clearClusterRating(memberIds, prev));
      // Reset article-level feedback on the lead.
      const currentMap = feedbackMapRef.current;
      const updatedMap = resetUserImportance(row.id, currentMap);
      setFeedbackMap(updatedMap);
      const updatedArticles = articlesRef.current.map((a) =>
        a.id === row.id ? { ...a, importance: a.originalImportance ?? a.importance } : a,
      );
      setArticles(updatedArticles);
      saveLearningProfile(rebuildLearningProfile(updatedArticles, updatedMap));
      if (typeof window !== "undefined" && window.desktop) {
        void window.desktop.data.saveImportanceFeedback({
          articleId: row.id,
          reset: true,
        });
      }
      return;
    }
    // Cluster-level rating.
    setClusterRatings((prev) => setClusterRating(memberIds, next, prev));
    // Article-level feedback on the lead (learning system).
    const importance = interestToImportance(next);
    const trueOriginal = row.originalImportance ?? row.importance;
    const currentMap = feedbackMapRef.current;
    const updatedMap = setUserImportance(row.id, trueOriginal, importance, currentMap);
    setFeedbackMap(updatedMap);
    const updatedArticles = articlesRef.current.map((a) =>
      a.id === row.id
        ? {
            ...a,
            originalImportance: a.originalImportance ?? a.importance,
            importance,
          }
        : a,
    );
    setArticles(updatedArticles);
    saveLearningProfile(rebuildLearningProfile(updatedArticles, updatedMap));
    if (typeof window !== "undefined" && window.desktop) {
      void window.desktop.data.saveImportanceFeedback({
        articleId: row.id,
        originalImportance: trueOriginal,
        userImportance: importance,
      });
    }
  }, [setClusterRatings]);

  const toggleTeaching = useCallback(
    (id: string) => {
      setTeaching((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [setTeaching],
  );

  const removeTeaching = useCallback(
    (id: string) => {
      setTeaching((prev) => prev.filter((x) => x !== id));
    },
    [setTeaching],
  );

  const handleTagToggle = useCallback((t: string) => {
    setActiveTag((prev) => (prev === t ? null : t));
  }, []);

  // ── Keyboard shortcuts (single-bind) ──
  // All values the handler reads are mirrored in keyStateRef, so the
  // window listener attaches once on mount instead of every keystroke.
  type KeyState = {
    filtered: ScanRow[];
    selected: ScanRow | null;
    drawerOpen: boolean;
    rateRow: (row: ScanRow, next: InterestLevel | null) => void;
    toggleTeaching: (id: string) => void;
    setSelectedId: Dispatch<SetStateAction<string | null>>;
    setActiveTag: Dispatch<SetStateAction<string | null>>;
    setDrawerOpen: Dispatch<SetStateAction<boolean>>;
    setDigest: Dispatch<SetStateAction<boolean>>;
  };
  const keyStateRef = useRef<KeyState>({
    filtered,
    selected,
    drawerOpen,
    rateRow,
    toggleTeaching,
    setSelectedId,
    setActiveTag,
    setDrawerOpen,
    setDigest,
  });
  // Sync the latest values into the ref after render. Done in an effect (not
  // an assignment during render) so it's safe under concurrent rendering.
  useEffect(() => {
    keyStateRef.current = {
      filtered,
      selected,
      drawerOpen,
      rateRow,
      toggleTeaching,
      setSelectedId,
      setActiveTag,
      setDrawerOpen,
      setDigest,
    };
  });

  // Keyboard listener attaches once on mount. It reads from keyStateRef so it
  // sees the latest filtered/selected/etc without re-binding on every change.
  // (setters from useState are stable; the ref pattern is intentional.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = keyStateRef.current;
      if (e.key === "j" || e.key === "k") {
        if (s.filtered.length === 0) return;
        const idx = s.selected
          ? s.filtered.findIndex((r) => r.id === s.selected!.id)
          : -1;
        const nextIdx =
          e.key === "j"
            ? Math.min(idx + 1, s.filtered.length - 1)
            : Math.max(idx - 1, 0);
        const target = s.filtered[nextIdx < 0 ? 0 : nextIdx];
        if (target) s.setSelectedId(target.id);
        e.preventDefault();
        return;
      }
      if (["1", "2", "3", "4"].includes(e.key) && s.selected) {
        s.rateRow(s.selected, Number(e.key) as InterestLevel);
        e.preventDefault();
        return;
      }
      if (e.key === "t" && s.selected) {
        s.toggleTeaching(s.selected.id);
        e.preventDefault();
        return;
      }
      if (e.key === "g") {
        s.setDigest((v) => !v);
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        if (s.drawerOpen) s.setDrawerOpen(false);
        else s.setActiveTag(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const headerTitle =
    activeDomain === "All" ? "All Sectors" : getDomain(activeDomain).label;

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    [],
  );

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
        color: "#0f172a",
        background: "#020617",
        position: "fixed",
        inset: 0,
      }}
    >
      <SectorRail
        totalCount={rows.length}
        activeDomain={activeDomain}
        onDomainChange={(d) => setActiveDomain(d)}
        domainStats={domainStats}
        counts={counts}
        teachingCount={teaching.length}
        onOpenTeaching={() => setDrawerOpen(true)}
      />

      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          background: "#f8fafc",
        }}
      >
        {/* Top header */}
        <div
          style={{
            padding: "16px 24px 12px",
            borderBottom: "1px solid #e2e8f0",
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 12,
              gap: 16,
            }}
          >
            <div className="min-w-0">
              <div
                className="font-bold uppercase tracking-[0.14em]"
                style={{ fontSize: 10, color: "#64748b" }}
              >
                What matters today · {todayLabel}
              </div>
              <h1
                className="font-semibold tracking-[-0.01em]"
                style={{ margin: "4px 0 0", fontSize: 22, color: "#020617" }}
              >
                {headerTitle}
                {activeTag ? <span style={{ color: "#0284c7" }}> · #{activeTag}</span> : null}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {/* Digest toggle */}
              <div
                style={{
                  display: "inline-flex",
                  background: "#f1f5f9",
                  borderRadius: 7,
                  padding: 2,
                  border: "1px solid #e2e8f0",
                }}
              >
                <button
                  type="button"
                  onClick={() => setDigest(false)}
                  style={modeBtn(!digest)}
                  title="Full stream with summaries"
                >
                  Full
                </button>
                <button
                  type="button"
                  onClick={() => setDigest(true)}
                  style={modeBtn(digest)}
                  title="30-second sweep — one line per cluster, Skip hidden"
                >
                  <span style={{ marginRight: 5 }}>☰</span>
                  Digest
                </button>
              </div>
              <div
                className="font-mono text-right"
                style={{ fontSize: 10.5, color: "#64748b", lineHeight: 1.4 }}
              >
                {filtered.length} {digest ? "in digest" : "clusters"}
                <br />
                <span style={{ color: "#94a3b8" }}>
                  {digest ? "Skip hidden · 1-line" : "sorted by interest × impact"}
                </span>
              </div>
            </div>
          </div>
          {shifts.length ? (
            <ShiftStrip
              shifts={shifts}
              activeTag={activeTag}
              onTagClick={handleTagToggle}
            />
          ) : null}
        </div>

        {/* Stream */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: digest ? "8px 24px 32px" : "16px 24px 32px",
          }}
        >
          {loadError ? (
            <div
              role="alert"
              style={{
                margin: "0 0 12px",
                padding: "10px 14px",
                background: "#fff1f2",
                border: "1px solid #fda4af",
                borderRadius: 8,
                color: "#9f1239",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span>
                Couldn&apos;t load articles — <span className="font-mono">{loadError}</span>
              </span>
              <button
                type="button"
                onClick={() => void loadData()}
                style={{
                  padding: "5px 12px",
                  border: "1px solid #fda4af",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#9f1239",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
          {loading && rows.length === 0 ? (
            <div className="text-center" style={{ padding: 64, color: "#94a3b8" }}>
              Loading articles…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center" style={{ padding: 64, color: "#94a3b8" }}>
              {rows.length === 0
                ? "No articles yet. Run a refresh to pull from feeds."
                : "No clusters match the current filters."}
            </div>
          ) : digest ? (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {filtered.map((r, i) => (
                <DigestRow
                  key={r.id}
                  row={r}
                  index={i + 1}
                  selected={selectedId === r.id}
                  interest={interestForRow(r)}
                  inTeaching={teachingSet.has(r.id)}
                  onSelect={() => setSelectedId(r.id)}
                  onRate={(v) => rateRow(r, v)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((r) => (
                <TerminalRow
                  key={r.id}
                  row={r}
                  selected={selectedId === r.id}
                  interest={interestForRow(r)}
                  inTeaching={teachingSet.has(r.id)}
                  onSelect={() => setSelectedId(r.id)}
                  onRate={(v) => rateRow(r, v)}
                  onTag={handleTagToggle}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <ReaderPane
        row={selected}
        interest={selected ? interestForRow(selected) : null}
        setInterest={(v) => selected && rateRow(selected, v)}
        onClose={() => setSelectedId(null)}
        onAddTeaching={() => selected && toggleTeaching(selected.id)}
        inTeaching={Boolean(selected && teachingSet.has(selected.id))}
        width={440}
      />

      <TeachingDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        itemIds={teaching}
        rows={rows}
        onRemove={removeTeaching}
      />
    </div>
  );
}
