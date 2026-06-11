const { app, BrowserWindow, Menu, dialog, ipcMain, Notification, shell, powerMonitor } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { initDb, getDbPath, getUserDataPath, closeDb } = require("./db");
const {
  getArticles,
  getTopSignals,
} = require("./repositories/articlesRepo");
const {
  clearLearningProfile,
  getAffinities,
  getImportanceFeedback,
  getLastRefresh,
  getLastRefreshError,
  getLastRefreshStats,
  getLearningProfile,
  getPreferences,
  getRules,
  getUserFeedback,
  saveImportanceFeedback,
  savePreferences,
  saveUserFeedback,
} = require("./repositories/preferencesRepo");
const {
  getBrief,
  getInsights,
  getLongTermTrends,
  getPatterns,
} = require("./repositories/patternsRepo");
const {
  getClusterHistory,
  getMemoryState,
  markClusterViewed,
  markDomainViewed,
  saveNarrativeThreads,
  setDomainCollapsed,
  snapshotClusters,
} = require("./repositories/memoryRepo");
const { createNotificationService } = require("./services/notificationService");
const { createRefreshService } = require("./services/refreshService");
const { createScheduler } = require("./services/scheduler");
const {
  createSnapshot,
  exportSnapshot,
  importSnapshot,
} = require("./services/importExportService");
const { createSearchService } = require("./search");
const {
  sanitizeArticleFilters,
  sanitizeSearchInput,
  sanitizeSavedSearchPayload,
  sanitizeWeek,
  sanitizeArticleId,
  sanitizeSavedSearchId,
  sanitizeImportanceFeedback,
  sanitizeUserFeedback,
  sanitizePreferences,
  clampNumber,
  sanitizeClusterIdValue,
  sanitizeMemoryDomain,
  sanitizeMemorySnapshotPayload,
  sanitizeDomainCollapsePayload,
} = require("./ipcValidate");

const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:3000";

let mainWindow = null;
let desktopDb = null;
let notificationService = null;
let refreshService = null;
let scheduler = null;
let searchService = null;

function isLocalHttpUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

function productionEntry() {
  const staticIndex = path.join(app.getAppPath(), "out", "index.html");

  return fs
    .access(staticIndex)
    .then(() => ({ type: "file", value: staticIndex }))
    .catch(() => {
      const configuredUrl = process.env.NEXT_APP_URL;

      if (configuredUrl && isLocalHttpUrl(configuredUrl)) {
        return { type: "url", value: configuredUrl };
      }

      return {
        type: "html",
        value: `
          <main style="font-family: system-ui; padding: 32px; color: #0f172a;">
            <h1>News Agg</h1>
            <p>Packaged offline assets are not configured for this build.</p>
            <p>Run the Next app locally or set NEXT_APP_URL to a localhost URL.</p>
          </main>
        `,
      };
    });
}

async function loadRenderer(window) {
  if (!app.isPackaged) {
    await window.loadURL(DEV_SERVER_URL);
    return;
  }

  const entry = await productionEntry();

  if (entry.type === "file") {
    await window.loadFile(entry.value);
  } else if (entry.type === "url") {
    await window.loadURL(entry.value);
  } else {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(entry.value)}`);
  }
}

async function exportPayload(payload, parentWindow) {
  const result = await dialog.showSaveDialog(parentWindow, {
    title: "Export Current Data",
    defaultPath: `news-agg-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, error: "Export canceled" };
  }

  await fs.writeFile(result.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { success: true, path: result.filePath };
}

async function exportSnapshotDialog(parentWindow) {
  const result = await dialog.showSaveDialog(parentWindow, {
    title: "Export Local Data",
    defaultPath: path.join(
      app.getPath("documents"),
      `news-agg-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
    ),
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, error: "Export canceled" };
  }

  return exportSnapshot(desktopDb, result.filePath);
}

async function exportRecallBookmarksDialog(parentWindow, payload) {
  const html = typeof payload?.html === "string" ? payload.html : "";
  const requestedFilename =
    typeof payload?.filename === "string" ? payload.filename : "";
  const safeFilename = /^[\w.\-]+\.html?$/i.test(requestedFilename)
    ? requestedFilename
    : `news_agg-recall-${new Date().toISOString().slice(0, 10)}.html`;

  if (!html) {
    return { success: false, error: "Empty bookmark payload" };
  }

  const result = await dialog.showSaveDialog(parentWindow, {
    title: "Send Articles to Recall",
    defaultPath: path.join(app.getPath("documents"), safeFilename),
    filters: [{ name: "Bookmark HTML", extensions: ["html"] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, error: "Export canceled" };
  }

  await fs.writeFile(result.filePath, html, "utf8");
  return { success: true, path: result.filePath };
}

async function importSnapshotDialog(parentWindow) {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: "Import Local Data",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePaths[0]) {
    return { success: false, error: "Import canceled" };
  }

  return importSnapshot(desktopDb, result.filePaths[0]);
}

function notifyRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getPowerState() {
  if (typeof powerMonitor?.isOnBatteryPower !== "function") {
    return { source: "unknown", onBattery: false };
  }

  const onBattery = powerMonitor.isOnBatteryPower();
  return {
    source: onBattery ? "battery" : "external",
    onBattery,
  };
}

async function runRefreshFromMenu() {
  try {
    const result = await refreshService.runRefresh({ manual: true });
    notifyRenderer("desktop:refreshComplete", result);
  } catch (error) {
    const result = {
      success: false,
      inserted: 0,
      error: error instanceof Error ? error.message : "Unknown refresh error",
    };
    notifyRenderer("desktop:refreshComplete", result);
    dialog.showErrorBox("Refresh failed", result.error);
  }
}

function createMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Refresh Now",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            void runRefreshFromMenu();
          },
        },
        { type: "separator" },
        {
          label: "Export Data",
          accelerator: "CmdOrCtrl+E",
          click: async () => {
            await exportSnapshotDialog(mainWindow).catch((error) => {
              dialog.showErrorBox("Export failed", error.message);
            });
          },
        },
        {
          label: "Import Data",
          accelerator: "CmdOrCtrl+I",
          click: async () => {
            const result = await importSnapshotDialog(mainWindow).catch((error) => ({
              success: false,
              error: error.message,
            }));

            notifyRenderer("desktop:importComplete", result);
          },
        },
        {
          label: "Toggle Notifications",
          click: () => {
            const current = getPreferences(desktopDb);
            savePreferences(desktopDb, {
              notificationsEnabled: !current.notificationsEnabled,
            });
            createMenu();
            notifyRenderer("desktop:preferencesChanged", getPreferences(desktopDb));
          },
        },
        {
          label: "Open Data Folder",
          click: () => {
            void shell.openPath(getUserDataPath());
          },
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 950,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the user's default browser
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isLocalHttpUrl(navigationUrl) && !navigationUrl.startsWith("file:")) {
      event.preventDefault();
    }
  });

  await loadRenderer(mainWindow);
}

ipcMain.handle("desktop:appInfo", () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  dataPath: getUserDataPath(),
  dbPath: getDbPath(),
}));

ipcMain.handle("desktop:ping", () => "pong");

ipcMain.handle("desktop:exportData", async (event, payload) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;

  try {
    return await exportPayload(payload, parentWindow);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown export error",
    };
  }
});

ipcMain.handle("desktop:data:getTopSignals", (_event, filters = {}) => {
  return getTopSignals(desktopDb, sanitizeArticleFilters(filters));
});

ipcMain.handle("desktop:data:getArticles", (_event, filters = {}) => {
  return getArticles(desktopDb, sanitizeArticleFilters(filters));
});

ipcMain.handle("desktop:data:getPatterns", (_event, filters = {}) => {
  return getPatterns(desktopDb, sanitizeArticleFilters(filters));
});

ipcMain.handle("desktop:data:getBrief", (_event, week) => {
  return getBrief(desktopDb, sanitizeWeek(week));
});

ipcMain.handle("desktop:data:getInsights", (_event, week) => {
  return getInsights(desktopDb, sanitizeWeek(week));
});

ipcMain.handle("desktop:data:getLongTermTrends", (_event, filters = {}) => {
  const weeks = clampNumber(filters?.weeks, { min: 1, max: 520 });
  return getLongTermTrends(desktopDb, weeks);
});

ipcMain.handle("desktop:data:getImportanceFeedback", () => {
  return getImportanceFeedback(desktopDb);
});

ipcMain.handle("desktop:data:getUserFeedback", (_event, limit) => {
  return getUserFeedback(desktopDb, clampNumber(limit, { min: 1, max: 500 }));
});

ipcMain.handle("desktop:data:getAffinities", () => {
  return getAffinities(desktopDb);
});

ipcMain.handle("desktop:data:getRules", () => {
  return getRules(desktopDb);
});

ipcMain.handle("desktop:data:saveUserFeedback", (_event, payload) => {
  try {
    return saveUserFeedback(desktopDb, sanitizeUserFeedback(payload));
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid user feedback",
    };
  }
});

ipcMain.handle("desktop:data:saveImportanceFeedback", (_event, payload) => {
  try {
    return saveImportanceFeedback(desktopDb, sanitizeImportanceFeedback(payload));
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid importance feedback",
    };
  }
});

ipcMain.handle("desktop:data:clearLearningProfile", () => {
  return clearLearningProfile(desktopDb);
});

ipcMain.handle("desktop:data:getPreferences", () => ({
  ...getPreferences(desktopDb),
  learningProfile: getLearningProfile(desktopDb),
  appDataPath: getUserDataPath(),
  dbPath: getDbPath(),
  lastRefreshError: getLastRefreshError(desktopDb),
  lastRefreshStats: getLastRefreshStats(desktopDb),
}));

ipcMain.handle("desktop:data:savePreferences", (_event, payload = {}) => {
  try {
    const preferences = savePreferences(desktopDb, sanitizePreferences(payload));
    scheduler?.start();
    createMenu();
    notifyRenderer("desktop:preferencesChanged", preferences);
    return { success: true, preferences };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid preferences",
    };
  }
});

ipcMain.handle("desktop:jobs:runRefreshNow", async () => {
  try {
    const result = await refreshService.runRefresh({ manual: true });
    notifyRenderer("desktop:refreshComplete", result);
    return result;
  } catch (error) {
    return {
      success: false,
      inserted: 0,
      error: error instanceof Error ? error.message : "Unknown refresh error",
    };
  }
});

ipcMain.handle("desktop:jobs:getLastRefresh", () => getLastRefresh(desktopDb));

ipcMain.handle("desktop:notifications:requestStatus", () => {
  return notificationService.requestStatus();
});

ipcMain.handle("desktop:imports:importJson", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  const result = await importSnapshotDialog(parentWindow).catch((error) => ({
    success: false,
    error: error instanceof Error ? error.message : "Unknown import error",
  }));
  notifyRenderer("desktop:importComplete", result);
  return result;
});

ipcMain.handle("desktop:exports:exportJson", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  return exportSnapshotDialog(parentWindow).catch((error) => ({
    success: false,
    error: error instanceof Error ? error.message : "Unknown export error",
  }));
});

ipcMain.handle(
  "desktop:exports:exportRecallBookmarks",
  async (event, payload) => {
    const parentWindow =
      BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    return exportRecallBookmarksDialog(parentWindow, payload).catch((error) => ({
      success: false,
      error: error instanceof Error ? error.message : "Unknown export error",
    }));
  },
);

ipcMain.handle("desktop:exports:getSnapshot", () => createSnapshot(desktopDb));

ipcMain.handle("desktop:search:query", (_event, input = {}) => {
  return searchService.query(sanitizeSearchInput(input));
});

ipcMain.handle("desktop:search:relatedArticles", (_event, articleId) => {
  return searchService.relatedArticles(sanitizeArticleId(articleId));
});

ipcMain.handle("desktop:search:recent", () => {
  return searchService.recent();
});

ipcMain.handle("desktop:search:saveSearch", (_event, payload = {}) => {
  return searchService.saveSearch(sanitizeSavedSearchPayload(payload));
});

ipcMain.handle("desktop:search:savedSearches", () => {
  return searchService.savedSearches();
});

ipcMain.handle("desktop:search:deleteSavedSearch", (_event, id) => {
  return searchService.deleteSavedSearch(sanitizeSavedSearchId(id));
});

ipcMain.handle("desktop:search:rebuildIndex", () => {
  return searchService.rebuildIndex();
});

ipcMain.handle("desktop:search:stats", () => {
  return searchService.stats();
});

ipcMain.handle("desktop:memory:getState", () => {
  try {
    return getMemoryState(desktopDb);
  } catch (error) {
    return {
      clusterViewStates: {},
      domainViewStates: {},
      threads: [],
      latestSnapshots: {},
      error: error instanceof Error ? error.message : "Unknown memory error",
    };
  }
});

ipcMain.handle("desktop:memory:snapshotClusters", (_event, payload) => {
  try {
    const { clusters, threads, snapshotAt } = sanitizeMemorySnapshotPayload(payload);
    const snapshotResult = snapshotClusters(desktopDb, clusters, { snapshotAt });
    const threadResult = threads.length ? saveNarrativeThreads(desktopDb, threads) : { saved: 0 };
    return {
      success: true,
      inserted: snapshotResult.inserted,
      threadsSaved: threadResult.saved,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid memory payload",
    };
  }
});

ipcMain.handle("desktop:memory:markClusterViewed", (_event, clusterId) => {
  try {
    return markClusterViewed(desktopDb, sanitizeClusterIdValue(clusterId));
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid cluster id",
    };
  }
});

ipcMain.handle("desktop:memory:markDomainViewed", (_event, domain) => {
  try {
    return markDomainViewed(desktopDb, sanitizeMemoryDomain(domain));
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid domain",
    };
  }
});

ipcMain.handle("desktop:memory:setDomainCollapsed", (_event, payload) => {
  try {
    const { domain, collapsed } = sanitizeDomainCollapsePayload(payload);
    return setDomainCollapsed(desktopDb, domain, collapsed);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid domain payload",
    };
  }
});

ipcMain.handle("desktop:memory:getClusterHistory", (_event, payload = {}) => {
  try {
    const clusterId = sanitizeClusterIdValue(payload?.clusterId);
    const limit = clampNumber(payload?.limit, { min: 1, max: 50 });
    return getClusterHistory(desktopDb, clusterId, { limit });
  } catch (error) {
    return [];
  }
});

app.whenReady().then(async () => {
  desktopDb = initDb(app);
  searchService = createSearchService(desktopDb);
  notificationService = createNotificationService(Notification);
  refreshService = createRefreshService({
    db: desktopDb,
    notificationService,
    getPowerState,
    onComplete: (result) => notifyRenderer("desktop:refreshComplete", result),
  });
  scheduler = createScheduler({
    refreshService,
    getIntervalMinutes: () => getPreferences(desktopDb).refreshIntervalMinutes,
  });
  createMenu();
  await createWindow();
  scheduler.start();
  scheduler.runAfterDelay(2500);

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("before-quit", () => {
  scheduler?.stop();
  closeDb();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
