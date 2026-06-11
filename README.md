# Tech Intelligence Command Center

Local-first tech intelligence dashboard built with Next.js.

## Electron Phase 1

Phase 1 adds a thin Electron desktop shell around the existing app without rebuilding the React/Next.js UI.

### What Was Added

- Electron main process in `electron/main.js`
- Secure preload bridge in `electron/preload.js`
- Electron Forge config in `forge.config.js`
- Desktop renderer typing in `types/desktop.d.ts`
- A small desktop-aware control in the command center header
- IPC handlers for app info, ping, and JSON export

### Desktop API

The renderer only receives this narrow API:

```ts
window.desktop = {
  appInfo: () => Promise<{ name: string; version: string; platform: string }>,
  exportData: (payload: unknown) => Promise<{ success: boolean; path?: string; error?: string }>,
  ping: () => Promise<string>
}
```

The renderer does not receive raw `ipcRenderer`, filesystem access, `shell`, or broad Electron APIs.

### Run Desktop Development

```bash
npm run dev:desktop
```

This starts the Next.js dev server on `http://127.0.0.1:3000`, waits for it, then launches Electron Forge.

The existing web app can still run separately:

```bash
npm run dev
```

### Package And Make

```bash
npm run package:desktop
npm run make:desktop
```

### Production Loading Assumption

In development, Electron loads the local Next.js dev server.

In packaged mode, Phase 1 tries to load `out/index.html` if a future static export exists. If it does not, it can load `NEXT_APP_URL` when that value points to `localhost` or `127.0.0.1`. Fully bundled offline Next.js serving is intentionally deferred.

### Deferred To Phase 2

- Local database
- Background ingestion
- Notifications
- Offline cache expansion
- Richer file import/export
- Fully bundled local Next.js runtime or static export strategy
- Auto-updater and installer polish

## Electron Phase 2

Phase 2 turns the desktop shell into a local-first app while preserving the existing command center UI. The renderer still runs as a secure React/Next.js surface; filesystem access, SQLite, RSS refresh jobs, import/export, and notifications live in Electron main-process modules.

### Local DB Design

The desktop database is SQLite via `better-sqlite3`, initialized from `electron/db.js` with versioned migrations in `electron/migrations.js`.

The schema stores:

- `articles`, `tags`, and `article_tags` for normalized article persistence and tag joins
- `patterns`, `briefs`, and `insights` for local snapshots
- `importance_feedback` and `learning_profile` for personalization
- `preferences` for refresh and notification settings
- `schema_version` for idempotent startup migrations

Repository modules under `electron/repositories/` expose explicit operations for articles, patterns/briefs/insights, feedback, and preferences. The renderer never receives SQL access.

### Data Location

The DB file is stored outside the repo under Electron's app data directory:

```text
app.getPath("userData")/news-agg.sqlite
```

The in-app desktop settings panel shows both the app data path and DB path. The app menu also includes `Open Data Folder`.

To reset local desktop data during development, quit the app and remove `news-agg.sqlite` from the shown data folder. The next launch recreates the schema automatically. Existing `tech-command-center.sqlite` files are copied forward on first launch for compatibility.

### Background Refresh

`electron/services/refreshService.js` fetches curated RSS sources, normalizes articles, infers lightweight tags/importance, dedupes by URL, writes new records to SQLite, and updates local pattern, brief, and insight snapshots.

`electron/services/scheduler.js` starts a refresh shortly after app launch and then repeats on the configured interval while the app is open. Refresh jobs are guarded so overlapping runs are skipped. Manual refresh is available from:

- Command center desktop controls
- App menu: `Refresh Now`

If network refresh fails, the renderer continues reading cached SQLite data and shows a subtle cached-data status.

### Notifications

Desktop notifications are emitted from the main process only. The app notifies only for newly inserted articles that meet either condition:

- article importance is at or above the configured threshold
- personalized score is at or above the configured threshold

Notifications can be disabled in desktop settings or toggled from the app menu. The default threshold is `5/5`.

To test notifications, run the desktop app, keep notifications enabled, then trigger `Refresh Now`. macOS may require allowing notifications for the Electron app.

### Import And Export

Phase 2 exports a JSON snapshot containing articles, tags, article-tag joins, patterns, briefs, insights, feedback, learning profile, and preferences. Exports default to the user's Documents folder unless another location is selected.

Imports validate the selected JSON file, merge article data through the repository layer, and dedupe articles by URL. Malformed files return a controlled error instead of crashing the renderer.

Export/import are available from:

- Command center desktop controls
- App menu: `Export Data` and `Import Data`

### Offline Mode

The command center now checks `window.desktop` and, when running inside Electron, loads articles, patterns, briefs, insights, feedback, preferences, and last-refresh state from SQLite through the preload bridge. Live network access is not required for the UI to render cached data.

To test offline behavior, launch the desktop app once online so SQLite has data, disconnect the network, then relaunch or reload. The dashboard should load from local cache and report cached/offline refresh status if a refresh fails.

### Desktop API

The preload bridge remains narrow and explicit:

```ts
window.desktop = {
  appInfo,
  ping,
  exportData,
  data: {
    getTopSignals,
    getArticles,
    getPatterns,
    getBrief,
    getInsights,
    getLongTermTrends,
    getImportanceFeedback,
    saveImportanceFeedback,
    clearLearningProfile,
    getPreferences,
    savePreferences
  },
  jobs: {
    runRefreshNow,
    getLastRefresh,
    onRefreshComplete
  },
  notifications: {
    requestStatus
  },
  imports: {
    importJson,
    onImportComplete
  },
  exports: {
    exportJson,
    getSnapshot
  }
}
```

`contextIsolation` remains enabled, `nodeIntegration` remains disabled, and the renderer never receives `ipcRenderer`, raw filesystem APIs, or generic database methods.

### Development Workflow

```bash
npm run dev:web
npm run dev:desktop
npm run make:desktop
npm test
```

`npm test` includes pragmatic Phase 2 coverage for migration execution, article insert/dedupe, tag joins, importance feedback persistence, JSON import/export round-trip, and refresh overlap prevention.

## Phase 3A Search

Phase 3A adds a desktop-local search and recall layer before any sync work. Search runs entirely against the local SQLite database through Electron main-process repositories; the renderer only calls explicit preload methods and never receives SQL access.

### Why SQLite FTS5

SQLite FTS5 keeps the search index local, fast, durable, and easy to ship inside the existing `better-sqlite3` desktop stack. It avoids introducing a service dependency before sync exists, works offline against cached articles, and can be rebuilt from the normalized article tables at any time.

### Indexed Fields

The `article_search` FTS5 virtual table is maintained from the source-of-truth article schema. It indexes:

- `headline`
- `summary`
- `source`
- `tags_text`, a concatenated local tag string

The `article_id` column is stored as `UNINDEXED` and points back to `articles.id`. Article metadata such as domain, publish time, importance, personalized score, URL, and normalized tags still live in `articles`, `tags`, and `article_tags`.

### Article Table Versus FTS Index

`articles` remains the canonical record. The FTS table is a derived lookup structure used to find candidate article IDs quickly. Repository writes update the article row, tag joins, and FTS row in the same local transaction. If the derived index ever drifts, the app can safely delete and rebuild `article_search` from `articles` plus `article_tags` without losing user data.

### Ranking

Search ranking is intentionally predictable:

- FTS5 BM25 relevance provides the main match signal for text queries.
- Effective importance uses user feedback overrides when present, then article importance.
- Personalized score adds a small boost when available.
- Recency adds a light boost so fresh material is easier to find without overwhelming relevance and importance.

For filter-only searches, ranking leans more on importance and recency because there is no FTS text relevance signal.

### Related Articles

Related article retrieval is local and lightweight. It scores candidates with:

- overlapping tags
- same domain
- keyword overlap from headline and summary
- nearby publish window as a small boost
- importance and personalized score as secondary boosts

Recency and importance cannot create a relationship by themselves; a candidate still needs tag, domain, or keyword overlap.

### Recent And Saved Searches

Recent searches are stored automatically in `recent_searches` with query text, filters, and timestamp. Named saved searches are stored in `saved_searches`, including filters, so research tracks such as `AI infra energy`, `Graphene commercialization`, or `CRISPR regulation` can be reopened locally.

### Desktop API

Phase 3A adds this explicit preload surface:

```ts
window.desktop.search = {
  query,
  relatedArticles,
  recent,
  saveSearch,
  savedSearches,
  deleteSavedSearch,
  rebuildIndex,
  stats
}
```

There is still no generic SQL bridge.

### Rebuild The Index

Use the desktop Settings panel and select `Rebuild search index`. The same operation is available in main-process code as `rebuildSearchIndex(db)` from `electron/repositories/searchRepo.js`. Rebuilds repopulate `article_search` from local article and tag tables and record the last rebuild time in preferences.

### Phase 3B Deferred Items

- Cloud sync
- Conflict resolution
- Remote backup
- Cross-device profile/state merge
- Optional semantic/vector search
