# Engineering Onboarding — Tech Intelligence Command Center

> Audience: an engineer comfortable with React who is taking over this project.
> Goal: understand what the app does, how it is structured, and where to make changes.

---

## 1. What this is

A **local-first desktop app** that turns a curated set of RSS feeds into a personal tech-intelligence
dashboard. It fetches articles in the background, enriches them with a **local LLM (Ollama)**,
clusters related stories, tracks trends over time, and learns what you care about — all on your
machine. There is no server, no account, and no cloud dependency. Your data lives in a single
SQLite file in your OS user-data directory.

The UI is a React/Next.js app, but it runs **inside an Electron shell**. Treat "the app" as the
Electron desktop app. (A browser/web mode exists and shares the same React components, but per the
current direction it is not the target — this doc focuses on the desktop/local path.)

The core mental model:

```
 RSS feeds ──▶ Electron main process ──▶ SQLite  ──▶ preload bridge ──▶ React renderer (UI)
              (fetch, extract, LLM,      (durable      (window.desktop     (clusters, trends,
               dedupe, score, snapshot)   cache)        IPC surface)        personalization)
```

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| UI | React 19 + Next.js 16 (App Router), Tailwind CSS |
| Desktop shell | Electron 41, packaged with Electron Forge |
| Local database | SQLite via `better-sqlite3` (synchronous, in main process) |
| Full-text search | SQLite FTS5 virtual table |
| AI enrichment | Local Ollama (OpenAI-compatible), heuristic fallback |
| Feed parsing | `rss-parser` |
| Language | TypeScript (renderer + shared libs), plain CommonJS JS (Electron main) |
| Tests | Vitest |

`pg` (Postgres) is still a dependency because the legacy web path uses it. **The desktop app never
touches Postgres** — ignore `lib/db.ts` unless you are working on web mode.

---

## 3. The three-process architecture (the most important section)

If you come from React, the biggest adjustment is that this is **not** a single JS context. There are
three, with a hard security boundary between them:

### 3.1 Electron main process — `electron/*.js`
Plain Node.js. This is the "backend." It:
- owns the SQLite database (`electron/db.js`)
- runs the background RSS refresh pipeline (`electron/services/refreshService.js`)
- talks to Ollama for AI enrichment
- schedules refreshes, sends OS notifications, handles import/export
- exposes everything to the UI **only** through named IPC handlers in `electron/main.js`

It is written in CommonJS (`require`, `module.exports`), **not** TypeScript, and does **not** import
from `lib/`. It has its own parallel copy of the logic it needs (see the duplication note in §7).

### 3.2 Preload bridge — `electron/preload.js`
A tiny, security-critical file. It uses `contextBridge` to expose a narrow, explicit API on
`window.desktop`. The renderer gets **only** these methods — never `ipcRenderer`, never `fs`, never
raw SQL. `contextIsolation` is on, `nodeIntegration` is off, `sandbox` is on. If you want the UI to
be able to do something new in the DB, you must add it in **three** places:
`electron/repositories/*` → `electron/main.js` (handler) → `electron/preload.js` (bridge method).

`window.desktop` surface (see `types/desktop.d.ts` for the typed contract):
- `data.*` — reads/writes: articles, patterns, brief, insights, long-term trends, feedback, affinities, rules, preferences
- `jobs.*` — `runRefreshNow`, `getLastRefresh`, `onRefreshComplete(cb)`
- `search.*` — query, relatedArticles, recent, save/list/delete saved searches, rebuildIndex, stats
- `memory.*` — cluster/domain view state, cluster history, narrative-thread snapshots
- `scan.*` — get/save the Scan view's persisted state
- `imports.* / exports.*` — JSON snapshot round-trip, Recall bookmark export
- `notifications.requestStatus`, `appInfo`, `ping`

### 3.3 React renderer — `app/` + `components/` + `lib/`
The Next.js app. This is where you'll spend most of your React time. It runs in the Electron
`BrowserWindow`. On mount, client components detect `window.desktop` and hydrate from SQLite (see
§8). The renderer also runs a meaningful amount of the "intelligence" (clustering, narratives,
scenarios) **client-side** at hydration time, using the TypeScript modules in `lib/`.

**Key consequence:** the same conceptual work (e.g. importance scoring, tag inference) exists in two
implementations — a lightweight one in `electron/services/*.js` that runs during background refresh,
and a richer one in `lib/*.ts` that runs in the renderer. They are intentionally separate. Don't
assume editing one changes the other.

---

## 4. Key features

- **Background RSS ingestion** — ~40 curated sources across 17 domains (AI/LLM/Infra, Semis, Cloud,
  Security, Bio, Climate, Crypto, Policy, Space, Robotics, etc.). Bounded, memory-aware, incremental.
- **Local AI enrichment** — each new article is summarized, domain-classified, tagged, and scored
  1–5 by a local LLM, with a heuristic fallback when Ollama is unavailable.
- **Full-text article extraction** — fetches the article page, strips boilerplate, feeds richer text
  to the LLM (skips known paywalled/scraper-hostile domains).
- **Story clustering** — related articles across sources are merged into `StoryCluster`s with a
  confidence level and impact score.
- **Trends & patterns** — tag frequency over rolling windows; rising/declining/stable long-term
  trends; a generated weekly brief and insight report.
- **Personalization / learning** — importance feedback, per-tag/entity affinities (with time decay),
  and explicit boost/suppress/filter rules re-rank what you see.
- **Local search + recall** — FTS5 search, related-article retrieval, recent + named saved searches.
- **Narrative memory** — cluster history snapshots, narrative threads, per-cluster/domain "seen"
  state so the UI can highlight what's new since you last looked.
- **The Scan view** — a dense terminal-style triage surface (the newest and most actively developed
  area; see §11).
- **Offline by default** — if the network or a refresh fails, the UI reads cached SQLite and shows a
  subtle "cached" status.
- **Import/Export** — full JSON snapshot of the local database; Recall bookmark HTML export.
- **Desktop notifications** — for newly inserted high-importance / high-personalized-score articles.

---

## 5. Directory map

```
electron/                    ← Electron MAIN process (Node/CommonJS). The "backend".
  main.js                    ← app lifecycle, window, menu, ALL ipcMain handlers
  preload.js                 ← the window.desktop bridge (security boundary)
  db.js / paths.js           ← SQLite init (WAL), userData paths, legacy DB copy-forward
  migrations.js              ← versioned schema (source of truth for the DB shape)
  ipcValidate.js             ← sanitizers for every IPC payload (defense in depth)
  search.js                  ← search service wrapper
  repositories/              ← the ONLY code allowed to run SQL
    articlesRepo.js          ← upsert/query articles, tags, dedupe keys
    patternsRepo.js          ← patterns, briefs, insights, week helpers
    preferencesRepo.js       ← prefs, feedback, affinities, rules, scan state, refresh metadata
    searchRepo.js            ← FTS5 query/rank, related articles, saved/recent searches, rebuild
    memoryRepo.js            ← cluster history, narrative threads, view state
  services/
    refreshService.js        ← THE ingestion pipeline (fetch→extract→AI→dedupe→persist→snapshot→notify)
    articleExtractor.js      ← full-text page extraction
    aiEnrichment.js          ← Ollama calls (summary/domain/tags/importance) + heuristic fallback
    scheduler.js             ← interval + launch/after-delay refresh triggers
    resourceMonitor.js       ← memory pressure detection; throttles/aborts refresh
    notificationService.js   ← OS notifications for high-signal new articles
    importExportService.js   ← JSON snapshot create/export/import
    sources.js               ← RSS source list (main-process copy)

app/                         ← Next.js App Router (the renderer entry points)
  layout.tsx  globals.css
  page.tsx                   ← "/" Command Center (main dashboard)
  scan/  trends/  patterns/  brief/   ← the other routes (each a thin wrapper over a client component)
  api/                       ← web-mode API routes (health, ingest, rss, feedback). Not used by desktop.

components/                  ← React components
  CommandCenterClient.tsx    ← main dashboard orchestrator (hydrates from window.desktop)
  scan/ScanTerminal.tsx      ← the Scan view orchestrator
  AppShell.tsx SidebarNav.tsx← nav shell; routes: Scan / Trends / Patterns / Brief
  (many presentational components: ArticleFeed, ClusterCard, KPIStrip, FiltersBar, TopSignals, …)

lib/                         ← Shared TypeScript. Runs in the RENDERER (and web mode). Pure-ish logic.
  types.ts                   ← domain types (Article, StoryCluster, TrendSignal, …) — read this first
  clustering.ts entities.ts dedup.ts   ← turn articles into clusters
  patterns.ts insights.ts brief.ts narratives.ts connections.ts   ← trends & synthesis
  scenarios.ts implications.ts watch.ts   ← forward-looking "what to watch" layer
  scoring.ts affinity.ts feedback.ts user.ts rules.ts   ← personalization / learning
  scanViewModel.ts teachingPack.ts scanExport.ts clusterRatings.ts   ← the Scan view's model
  recall.ts output.ts audience.ts templates.ts   ← export & generated-output formatting
  ai-client.ts ai.ts story-synthesis.ts   ← LLM client used by the web/renderer path
  db.ts store.ts data.ts sources.ts ingest.ts   ← WEB-MODE Postgres path (ignore for desktop)

types/desktop.d.ts           ← the TypeScript contract for window.desktop
scripts/dev-desktop.cjs      ← orchestrates `next dev` + Electron for local development
forge.config.js              ← Electron Forge packaging config
```

---

## 6. The refresh pipeline (data flow)

This is the heart of the app. Entry point: `refreshService.runRefresh(options)` in
`electron/services/refreshService.js`. It is triggered by:
- launch (a few seconds after the window opens),
- the scheduler (default every 15 min while the app is open),
- manual (`Refresh Now` menu / `Cmd+R` / desktop controls → `window.desktop.jobs.runRefreshNow()`),
- power `resume` (catch-up after sleep).

Steps:

1. **Guard.** Overlapping runs are skipped (a single in-flight `runningPromise`). Scheduled/launch
   runs are suspended on battery or long idle (`shouldSuspendScheduledRefresh` in `main.js`); manual
   runs always proceed.
2. **Fetch feeds** — bounded concurrency (3 at a time), per-feed byte cap, timeouts, memory-pressure
   backoff via `resourceMonitor`. Each item is normalized into an article (stable id from
   source+headline, week bucket, heuristic tags + importance + personalized score).
3. **Dedupe by URL** (and headline fallback).
4. **Filter to genuinely new articles** using known article keys from the DB (incremental — old
   articles are cheap no-ops).
5. **Full-text extraction** on the top N newest/highest-importance new articles (`articleExtractor`).
6. **AI enrichment** (`aiEnrichment.enrichArticlesWithAI`) — batched Ollama calls upgrade the
   summary, domain, tags, and importance. Heuristic values are kept if AI is disabled/unavailable.
   The model can be unloaded afterward to free RAM (see memory notes in `aiEnrichment.js`).
7. **Persist** — `articlesRepo.upsertArticles` writes articles + tag joins + the FTS row in one
   transaction.
8. **Recompute snapshots** — pattern snapshot for the week, brief, and insights are regenerated and
   saved (`patternsRepo`).
9. **Notify** — `notificationService` fires OS notifications for new articles at/above the importance
   or personalized-score threshold.
10. **Record metadata** — last-refresh time, stats, and any error string are stored in preferences so
    the UI can show "last refreshed / cached / error" status.
11. **Broadcast** — `onComplete` → `notifyRenderer("desktop:refreshComplete")`; the renderer re-reads
    via its `onRefreshComplete` subscription.

---

## 7. Data model & schema

The schema is defined in `electron/migrations.js` as an ordered list of versioned migrations, applied
idempotently at startup (tracked in `schema_version`). **This file is the source of truth for the DB
shape.** To change the schema, append a new migration object — never edit an existing one.

Core tables:

- `articles` — canonical article record (id, headline, summary, domain, source, url UNIQUE,
  importance, personalized_score, published_at, processed_at, raw_payload, domain_secondary_json).
- `tags` + `article_tags` — normalized many-to-many tags.
- `article_search` — **FTS5 virtual table**, a *derived* index over headline/summary/source/tags.
  Rebuildable from the base tables at any time (`searchRepo.rebuildSearchIndex`); if it drifts, delete
  and rebuild — no user data is lost.
- `patterns`, `briefs`, `insights` — weekly analysis snapshots.
- `importance_feedback` — user override of an article's importance.
- `user_feedback`, `user_affinity`, `rules` — the personalization/learning store.
- `learning_profile`, `preferences` — derived profile + settings (refresh interval, notification
  thresholds, last-refresh metadata, scan state, etc.), stored as JSON key/value.
- `cluster_history`, `narrative_threads`, `narrative_thread_clusters`, `cluster_view_state`,
  `domain_view_state` — the "memory" layer.

Migration history is also where **domain remapping** lives (e.g. legacy `AI` was split into
`LLM`/`AIUse`/`AIInfra`; `Chips→Semis`, etc.). If you see an unexpected domain value, check the remap
tables in `types.ts` (`LEGACY_DOMAIN_REMAP`) and migrations 4–5.

**On the duplication:** the DB path is stored outside the repo at
`app.getPath("userData")/news-agg.sqlite`. A legacy `tech-command-center.sqlite` is copied forward on
first launch (`electron/paths.js`). To reset local data in dev: quit the app and delete that file.

---

## 8. How the renderer hydrates (the React side)

`app/page.tsx` renders `<CommandCenterClient>`. In desktop mode it is handed a lightweight bootstrap
shell server-side, then the client component takes over:

1. On mount, `loadDesktopData()` checks for `window.desktop` and, if present, `Promise.allSettled`s a
   batch of reads: articles, patterns, brief, insights, long-term trends, importance feedback,
   affinities, rules, last refresh, preferences, memory state.
2. It sets those into React state, then **computes clusters client-side** from the raw articles
   (`buildClientClusters`), followed by narratives/connections/scenarios/implications/watch items via
   the `lib/` modules.
3. It subscribes to `window.desktop.jobs.onRefreshComplete(...)` so a background refresh re-triggers a
   reload.
4. Personalization (`lib/feedback`, `lib/affinity`, `lib/user`) re-ranks clusters; importance
   overrides are written back through `window.desktop.data.saveImportanceFeedback`.

`allSettled` + per-field fallbacks are used deliberately: a single failing read degrades one section
rather than blanking the dashboard. This "read cache, degrade gracefully" pattern recurs everywhere —
match it when you add features.

Routes (`components/SidebarNav.tsx`): **Scan**, **Trends**, **Patterns**, **Brief**, plus the root
Command Center. Each route file in `app/*` is a thin wrapper over a client component.

---

## 9. The intelligence layer (`lib/`)

Mostly pure functions over `Article[]` / `StoryCluster[]`. Pipeline, roughly:

```
articles ──clustering.ts──▶ clusters ──entities/dedup──▶ enriched clusters
   │                                          │
   ├─patterns.ts──▶ tag frequencies/trends    ├─narratives.ts──▶ narrative threads
   │                                          ├─connections.ts─▶ tag/entity graph
   └─scoring.ts + affinity.ts + feedback.ts + user.ts + rules.ts ──▶ personalized ranking
                                              └─scenarios.ts→implications.ts→watch.ts ─▶ "what to watch"
   patterns ──insights.ts / brief.ts──▶ weekly brief + insight report
```

Because these run in the renderer, they must stay dependency-light and reasonably fast. They are the
most unit-testable part of the codebase (`lib/*.test.ts` with Vitest) — add tests here first.

---

## 10. Personalization & learning

- **Importance feedback** — user re-rates an article's importance; stored per-article and used as the
  effective importance everywhere.
- **Affinities** (`lib/affinity.ts`) — per-tag and per-entity scores nudged by interactions, with
  daily time decay and clamping. Feeds ranking.
- **Rules** (`lib/rules.ts`, `rules` table) — explicit boost / suppress / filter on a tag, domain, or
  entity.
- **Learning profile** (`lib/feedback.ts`) — aggregates feedback into per-domain/per-tag importance
  adjustments, rebuilt from articles + feedback on hydration.

Ranking = base impact/importance → learned adjustment → affinity boost → rules → recency. Clearing
the profile is available from settings (`window.desktop.data.clearLearningProfile`).

---

## 11. The Scan view

The newest, densest surface — a keyboard-driven "terminal" for triaging the day's stories.
Orchestrator: `components/scan/ScanTerminal.tsx`; model layer: `lib/scanViewModel.ts` (domain
palette, `ScanRow` shape, trend/confidence types), `lib/teachingPack.ts`, `lib/scanExport.ts`,
`lib/clusterRatings.ts`.

Notable behaviors to know before touching it:
- It hydrates from `window.desktop.data.getArticles` + scan state, and falls back to a `localStorage`
  copy when `window.desktop` is absent (web mode / SSR) — hence the "two-pass localStorage hook" that
  avoids hydration mismatch.
- Persisted scan state round-trips through `window.desktop.scan.getState/saveState`, backed by the
  preferences repo. It degrades to a default state on error rather than failing the whole load.
- **Cluster-keyed ratings** (`lib/clusterRatings.ts`) solve "lead drift": when a cluster's lead
  article changes between refreshes, the user's prior rating stays attached to the cluster, not the
  row's lead id.
- Sub-components live in `components/scan/` (ReaderPane, SectorRail, InterestRater, TeachingDrawer,
  ShiftStrip, DigestRow, etc.).

---

## 12. Security model

Local, but the boundary is taken seriously:
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- The renderer never receives `ipcRenderer`, `fs`, `shell`, or generic SQL — only the explicit
  `window.desktop` methods.
- Every IPC payload is sanitized in `electron/ipcValidate.js` before it reaches a repository.
- External links open in the system browser (`setWindowOpenHandler` / `will-navigate` guards);
  in-app navigation is restricted to localhost/file URLs.

When adding IPC, keep this shape: **sanitize in `ipcValidate` → validate again in the repo → return
`{ success, error }` on failure instead of throwing across the bridge.**

---

## 13. Running, building, testing

Prereqs: Node, and (for real enrichment) a local **Ollama** with the configured model pulled. Without
Ollama the pipeline still works via heuristic fallback.

```bash
npm run dev:desktop     # start Next renderer (desktop mode) + wait for health + launch Electron
npm run dev:web         # renderer only in a browser at :3000 (web mode; not the target)
npm run make:desktop    # package a distributable via Electron Forge
npm test                # vitest (rebuilds better-sqlite3 for Node first)
npm run lint
```

`scripts/dev-desktop.cjs` is the dev orchestrator: it boots `next dev` in desktop mode, polls
`/api/health`, rebuilds native modules for Electron's ABI, then launches Electron pointed at
`http://127.0.0.1:3000`.

**Native module gotcha:** `better-sqlite3` is native and must match the runtime ABI. Node and Electron
need different builds — hence `rebuild:node` (for `npm test`) and `rebuild:electron` (for the app). If
you get a "was compiled against a different Node.js version" error, run the matching rebuild.

**Main-process changes require a full app restart.** The Electron renderer hot-reloads from `next dev`,
but edits to anything in `electron/` (main process) do not — quit and relaunch `dev:desktop`.

---

## 14. Configuration

Environment (`.env.local`, see `.env.example`):
- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `AI_ARTICLE_MODEL` / `AI_BRIEF_MODEL` / `AI_INSIGHT_MODEL` — models must be pulled in Ollama
- `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_DISABLED=1` (force heuristic-only)
- `AI_KEEP_MODEL_LOADED=1` / `AI_KEEP_ALIVE` — control whether the model is unloaded after refresh
- `NEWS_AGG_*_MEMORY_MB` — resource-monitor thresholds
- `POSTGRES_URL` — **web mode only**; unused by the desktop app

Runtime settings (refresh interval, notification thresholds, personalized-by-default, etc.) live in
the `preferences` table and are edited in-app via the desktop settings/controls.

---

## 15. Gotchas & orientation for a React dev

1. **Two runtimes, not one.** `electron/*.js` (CommonJS, main process) and `lib/*.ts` (TS, renderer)
   are separate worlds that don't import each other. Logic is duplicated on purpose.
2. **No direct DB access from React.** Everything goes through `window.desktop` → IPC → repository.
   Adding a data capability is a 3-file change (repo, handler, preload) plus the `types/desktop.d.ts`
   contract.
3. **`lib/db.ts`, `app/api/*`, `lib/ingest.ts` are the web path.** Postgres, not SQLite. Don't wire
   the desktop app to them.
4. **The schema is append-only migrations.** Change the DB by adding a migration in
   `electron/migrations.js`.
5. **Everything degrades gracefully.** Reads use `allSettled` + fallbacks; the UI must render from
   cache when the network, Ollama, or a single read fails. Preserve that.
6. **The FTS index is derived and disposable.** Rebuild it rather than hand-patching it.
7. **Background work is memory- and power-aware.** Refresh throttles under memory pressure and skips
   on battery/idle for scheduled runs. Manual refresh always runs.
8. **Start reading here:** `lib/types.ts` → `electron/migrations.js` → `electron/main.js` (IPC
   surface) → `electron/services/refreshService.js` → `components/CommandCenterClient.tsx`.
