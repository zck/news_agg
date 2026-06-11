const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  appInfo: () => ipcRenderer.invoke("desktop:appInfo"),
  exportData: (payload) => ipcRenderer.invoke("desktop:exportData", payload),
  ping: () => ipcRenderer.invoke("desktop:ping"),
  data: {
    getTopSignals: (filters) => ipcRenderer.invoke("desktop:data:getTopSignals", filters),
    getArticles: (filters) => ipcRenderer.invoke("desktop:data:getArticles", filters),
    getPatterns: (filters) => ipcRenderer.invoke("desktop:data:getPatterns", filters),
    getBrief: (week) => ipcRenderer.invoke("desktop:data:getBrief", week),
    getInsights: (week) => ipcRenderer.invoke("desktop:data:getInsights", week),
    getLongTermTrends: (filters) => ipcRenderer.invoke("desktop:data:getLongTermTrends", filters),
    getImportanceFeedback: () => ipcRenderer.invoke("desktop:data:getImportanceFeedback"),
    getUserFeedback: (limit) => ipcRenderer.invoke("desktop:data:getUserFeedback", limit),
    getAffinities: () => ipcRenderer.invoke("desktop:data:getAffinities"),
    getRules: () => ipcRenderer.invoke("desktop:data:getRules"),
    saveUserFeedback: (payload) => ipcRenderer.invoke("desktop:data:saveUserFeedback", payload),
    saveImportanceFeedback: (payload) =>
      ipcRenderer.invoke("desktop:data:saveImportanceFeedback", payload),
    clearLearningProfile: () => ipcRenderer.invoke("desktop:data:clearLearningProfile"),
    getPreferences: () => ipcRenderer.invoke("desktop:data:getPreferences"),
    savePreferences: (payload) => ipcRenderer.invoke("desktop:data:savePreferences", payload),
  },
  jobs: {
    runRefreshNow: () => ipcRenderer.invoke("desktop:jobs:runRefreshNow"),
    getLastRefresh: () => ipcRenderer.invoke("desktop:jobs:getLastRefresh"),
    onRefreshComplete: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:refreshComplete", listener);
      return () => ipcRenderer.removeListener("desktop:refreshComplete", listener);
    },
  },
  notifications: {
    requestStatus: () => ipcRenderer.invoke("desktop:notifications:requestStatus"),
  },
  imports: {
    importJson: () => ipcRenderer.invoke("desktop:imports:importJson"),
    onImportComplete: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:importComplete", listener);
      return () => ipcRenderer.removeListener("desktop:importComplete", listener);
    },
  },
  exports: {
    exportJson: () => ipcRenderer.invoke("desktop:exports:exportJson"),
    exportRecallBookmarks: (payload) =>
      ipcRenderer.invoke("desktop:exports:exportRecallBookmarks", payload),
    getSnapshot: () => ipcRenderer.invoke("desktop:exports:getSnapshot"),
  },
  search: {
    query: (input) => ipcRenderer.invoke("desktop:search:query", input),
    relatedArticles: (articleId) =>
      ipcRenderer.invoke("desktop:search:relatedArticles", articleId),
    recent: () => ipcRenderer.invoke("desktop:search:recent"),
    saveSearch: (payload) => ipcRenderer.invoke("desktop:search:saveSearch", payload),
    savedSearches: () => ipcRenderer.invoke("desktop:search:savedSearches"),
    deleteSavedSearch: (id) => ipcRenderer.invoke("desktop:search:deleteSavedSearch", id),
    rebuildIndex: () => ipcRenderer.invoke("desktop:search:rebuildIndex"),
    stats: () => ipcRenderer.invoke("desktop:search:stats"),
  },
  preferences: {
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:preferencesChanged", listener);
      return () => ipcRenderer.removeListener("desktop:preferencesChanged", listener);
    },
  },
  scan: {
    getState: () => ipcRenderer.invoke("desktop:scan:getState"),
    saveState: (payload) => ipcRenderer.invoke("desktop:scan:saveState", payload),
  },
  memory: {
    getState: () => ipcRenderer.invoke("desktop:memory:getState"),
    snapshotClusters: (payload) =>
      ipcRenderer.invoke("desktop:memory:snapshotClusters", payload),
    markClusterViewed: (clusterId) =>
      ipcRenderer.invoke("desktop:memory:markClusterViewed", clusterId),
    markDomainViewed: (domain) =>
      ipcRenderer.invoke("desktop:memory:markDomainViewed", domain),
    setDomainCollapsed: (payload) =>
      ipcRenderer.invoke("desktop:memory:setDomainCollapsed", payload),
    getClusterHistory: (payload) =>
      ipcRenderer.invoke("desktop:memory:getClusterHistory", payload),
  },
});
