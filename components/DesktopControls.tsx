"use client";

import { useEffect, useState } from "react";

type DesktopControlsProps = {
  exportPayload: unknown;
  refreshStatus?: string | null;
  onRefreshComplete?: (result?: DesktopOperationResult) => void;
  onPreferencesLoaded?: (preferences: DesktopPreferences) => void;
  onClearLearning?: () => void;
};

type AppInfo = {
  name: string;
  version: string;
  platform: string;
};

function formatSignedNumber(value: number | undefined) {
  const safeValue = Number.isFinite(value) ? Number(value) : 0;
  return `${safeValue > 0 ? "+" : ""}${safeValue.toFixed(1)}`;
}

function formatArticleImpact(result: DesktopOperationResult) {
  if (result.skipped) {
    if (result.skipReason === "battery") return "Auto-refresh paused on battery";
    if (result.skipReason === "idle") return "Auto-refresh paused while idle";
    return result.error ?? "Refresh skipped";
  }

  const incoming = result.incoming ?? (result.inserted ?? 0) + (result.updated ?? 0);
  const memoryBreaks =
    result.memoryBreaks && result.memoryBreaks > 0
      ? ` - ${result.memoryBreaks} memory break${result.memoryBreaks === 1 ? "" : "s"}`
      : "";
  // Incremental refreshes report already-known articles instead of "updated"
  // (known articles are skipped, not re-written). Older stored stats lack the
  // field, so keep the legacy "updated" segment as the fallback.
  const churn =
    result.skippedKnown != null
      ? `${result.skippedKnown} known`
      : `${result.updated ?? 0} updated`;
  return `${incoming} in - ${result.inserted ?? 0} new - ${churn}${memoryBreaks}`;
}

function formatResourceImpact(result: DesktopOperationResult) {
  if (!result.resourceImpact) {
    return null;
  }

  const impact = result.resourceImpact;
  return `CPU ${impact.cpuPercent.toFixed(1)}% avg - RSS ${formatSignedNumber(
    impact.rssDeltaMb,
  )} MB - heap ${formatSignedNumber(impact.heapUsedDeltaMb)} MB`;
}

export function DesktopControls({
  exportPayload,
  refreshStatus,
  onRefreshComplete,
  onPreferencesLoaded,
  onClearLearning,
}: DesktopControlsProps) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [preferences, setPreferences] = useState<DesktopPreferences | null>(null);
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [rebuildingSearch, setRebuildingSearch] = useState(false);
  const [lastRefreshResult, setLastRefreshResult] =
    useState<DesktopOperationResult | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!window.desktop) {
      return () => {
        mounted = false;
      };
    }

    setIsDesktop(true);
    void window.desktop?.appInfo().then((info) => {
      if (mounted) {
        setAppInfo(info);
      }
    });
    void window.desktop?.data.getPreferences().then((nextPreferences) => {
      if (mounted) {
        setPreferences(nextPreferences);
        setLastRefreshResult(nextPreferences.lastRefreshStats ?? null);
        onPreferencesLoaded?.(nextPreferences);
      }
    });
    void window.desktop?.search?.stats().then((stats) => {
      if (mounted) {
        setSearchStats(stats);
      }
    });
    const removeRefreshListener = window.desktop?.jobs.onRefreshComplete((result) => {
      setRefreshing(false);
      setLastRefreshResult(result);
      setExportStatus(formatArticleImpact(result));
      onRefreshComplete?.(result);
    });
    const removeImportListener = window.desktop?.imports.onImportComplete((result) => {
      setExportStatus(
        result.success
          ? `Imported ${result.count ?? 0} records`
          : result.error ?? "Import failed",
      );
      onRefreshComplete?.();
    });
    const removePreferencesListener = window.desktop?.preferences.onChanged((nextPreferences) => {
      setPreferences(nextPreferences);
      setLastRefreshResult((current) => nextPreferences.lastRefreshStats ?? current);
      onPreferencesLoaded?.(nextPreferences);
    });

    return () => {
      mounted = false;
      removeRefreshListener?.();
      removeImportListener?.();
      removePreferencesListener?.();
    };
  }, []);

  if (!isDesktop || !appInfo) {
    return null;
  }

  const handleExport = async () => {
    setExportStatus(null);
    const result = await window.desktop?.exports.exportJson() ??
      await window.desktop?.exportData(exportPayload);

    if (!result) {
      setExportStatus("Export unavailable");
      return;
    }

    setExportStatus(result.success ? "Exported JSON" : result.error ?? "Export canceled");
  };

  const handleImport = async () => {
    setExportStatus(null);
    const result = await window.desktop?.imports.importJson();
    setExportStatus(
      result?.success
        ? `Imported ${result.count ?? 0} records`
        : result?.error ?? "Import canceled",
    );
    onRefreshComplete?.();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setExportStatus("Refreshing, summarizing, and indexing...");
    const result = await window.desktop?.jobs.runRefreshNow();
    const searchResult = result?.success
      ? await window.desktop?.search.rebuildIndex()
      : null;
    const stats = await window.desktop?.search.stats();
    setRefreshing(false);
    setSearchStats(stats ?? null);
    setLastRefreshResult(result ?? null);
    setExportStatus(
      result
        ? `${formatArticleImpact(result)}${
            searchResult?.success
              ? ` - indexed ${searchResult.count ?? stats?.indexedCount ?? 0}`
              : ""
          }`
        : "Refresh failed",
    );
    onRefreshComplete?.(result ?? undefined);
  };

  const savePreference = async (payload: Partial<DesktopPreferences>) => {
    const result = await window.desktop?.data.savePreferences(payload);

    if (result?.success && result.preferences) {
      setPreferences(result.preferences);
      onPreferencesLoaded?.(result.preferences);
      setExportStatus("Settings saved");
    } else {
      setExportStatus(result?.error ?? "Settings failed");
    }
  };

  const handleClearLearning = async () => {
    const result = await window.desktop?.data.clearLearningProfile();
    if (result?.success) {
      onClearLearning?.();
      setExportStatus("Learning cleared");
    } else {
      setExportStatus(result?.error ?? "Clear failed");
    }
  };

  const handlePing = async () => {
    const response = await window.desktop?.ping();
    setExportStatus(response === "pong" ? "Desktop bridge online" : "Bridge unavailable");
  };

  const handleRebuildSearch = async () => {
    setRebuildingSearch(true);
    setExportStatus("Rebuilding search index...");
    const result = await window.desktop?.search.rebuildIndex();
    const stats = await window.desktop?.search.stats();
    setRebuildingSearch(false);
    setSearchStats(stats ?? null);
    setExportStatus(
      result?.success
        ? `Indexed ${result.count ?? stats?.indexedCount ?? 0} articles`
        : result?.error ?? "Index rebuild failed",
    );
    onRefreshComplete?.();
  };

  const resourceSummary = lastRefreshResult
    ? formatResourceImpact(lastRefreshResult)
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
        Desktop {appInfo.version} - {appInfo.platform}
      </span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-emerald-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {refreshing ? "Refreshing" : "Refresh search + summary"}
      </button>
      <button
        type="button"
        onClick={handleExport}
        className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-sky-700 transition hover:bg-slate-100"
      >
        Export
      </button>
      <button
        type="button"
        onClick={handleImport}
        className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-sky-700 transition hover:bg-slate-100"
      >
        Import
      </button>
      <button
        type="button"
        onClick={() => setSettingsOpen((current) => !current)}
        className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 transition hover:bg-slate-100"
        aria-expanded={settingsOpen}
      >
        Settings
      </button>
      <button
        type="button"
        onClick={handlePing}
        className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 transition hover:bg-slate-100"
      >
        Ping
      </button>
      {refreshStatus ? <span>{refreshStatus}</span> : null}
      {exportStatus ? <span>{exportStatus}</span> : null}
      {lastRefreshResult ? (
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
          {formatArticleImpact(lastRefreshResult)}
        </span>
      ) : null}
      {resourceSummary ? (
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700">
          {resourceSummary}
        </span>
      ) : null}
      {settingsOpen && preferences ? (
        <div className="mt-3 grid w-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm sm:grid-cols-2">
          <label className="space-y-1">
            <span className="font-medium text-slate-700">Refresh interval</span>
            <select
              value={preferences.refreshIntervalMinutes}
              onChange={(event) =>
                void savePreference({ refreshIntervalMinutes: Number(event.target.value) })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            >
              {[15, 30, 60, 120].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-medium text-slate-700">Notification threshold</span>
            <select
              value={preferences.notificationImportanceThreshold}
              onChange={(event) =>
                void savePreference({
                  notificationImportanceThreshold: Number(event.target.value),
                })
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
            >
              {[3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}/5
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.notificationsEnabled}
              onChange={(event) =>
                void savePreference({ notificationsEnabled: event.target.checked })
              }
            />
            <span>Notifications</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.personalizedDefault}
              onChange={(event) =>
                void savePreference({ personalizedDefault: event.target.checked })
              }
            />
            <span>Personalized default</span>
          </label>
          <button
            type="button"
            onClick={handleClearLearning}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Clear learned preferences
          </button>
          <button
            type="button"
            onClick={handleRebuildSearch}
            disabled={rebuildingSearch}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rebuildingSearch ? "Rebuilding search" : "Rebuild search index"}
          </button>
          {searchStats ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 sm:col-span-2">
              <div>
                Indexed {searchStats.indexedCount} of {searchStats.articleCount} articles
              </div>
              <div>
                Last indexed{" "}
                {searchStats.lastIndexedAt
                  ? new Date(searchStats.lastIndexedAt).toLocaleString()
                  : "not recorded"}
              </div>
            </div>
          ) : null}
          {lastRefreshResult ? (
            <div className="space-y-1 border-t border-slate-200 pt-3 text-slate-500 sm:col-span-2">
              <div className="font-medium text-slate-700">Last refresh</div>
              <div>{formatArticleImpact(lastRefreshResult)}</div>
              {resourceSummary ? <div>{resourceSummary}</div> : null}
              {lastRefreshResult.completedAt ? (
                <div>{new Date(lastRefreshResult.completedAt).toLocaleString()}</div>
              ) : null}
            </div>
          ) : null}
          <div className="min-w-0 text-slate-500">
            <div className="truncate">DB {preferences.dbPath}</div>
            <div className="truncate">Data {preferences.appDataPath}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
