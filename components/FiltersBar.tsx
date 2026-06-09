"use client";

import { Tag } from "@/components/Tag";
import { ArticleDomain, DOMAIN_LABELS } from "@/lib/types";
import { UserProfile } from "@/lib/user";

type FiltersBarProps = {
  timeRange: "today" | "week" | "month";
  activeDomain: "All" | ArticleDomain;
  activeTags: string[];
  availableTags: string[];
  tagQuery: string;
  personalizedView: boolean;
  profile: UserProfile;
  onTimeRangeChange: (value: "today" | "week" | "month") => void;
  onDomainChange: (value: "All" | ArticleDomain) => void;
  onTagToggle: (tag: string) => void;
  onTagQueryChange: (value: string) => void;
  onClearTags: () => void;
  onPersonalizedViewChange: (value: boolean) => void;
  onPreferredDomainToggle: (domain: ArticleDomain) => void;
  onPreferredTagToggle: (tag: string) => void;
  onExcludedTagToggle: (tag: string) => void;
  onClearImportanceLearning: () => void;
};

const timeRanges: Array<{ label: string; value: "today" | "week" | "month" }> = [
  { label: "Today", value: "today" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

const domains: Array<"All" | ArticleDomain> = [
  "All",
  "AIUse",
  "LLM",
  "AIInfra",
  "Semis",
  "Cloud",
  "Security",
  "Consumer",
  "Bio",
  "Climate",
  "Crypto",
  "Policy",
  "Space",
  "Robotics",
  "Batteries",
  "AR",
  "Materials",
  "General",
];

export function FiltersBar({
  timeRange,
  activeDomain,
  activeTags,
  availableTags,
  tagQuery,
  personalizedView,
  profile,
  onTimeRangeChange,
  onDomainChange,
  onTagToggle,
  onTagQueryChange,
  onClearTags,
  onPersonalizedViewChange,
  onPreferredDomainToggle,
  onPreferredTagToggle,
  onExcludedTagToggle,
  onClearImportanceLearning,
}: FiltersBarProps) {
  const visibleTags = availableTags.filter((tag) =>
    tag.toLowerCase().includes(tagQuery.trim().toLowerCase()),
  );
  const activeSummary = [
    timeRange === "today" ? "Today" : timeRange === "week" ? "Week" : "Month",
    activeDomain === "All" ? "All domains" : activeDomain,
    personalizedView ? "Personalized" : null,
    activeTags.length ? `${activeTags.length} tag${activeTags.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <section className="surface-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="section-kicker">Control Bar</p>
          <p className="mt-1 text-sm text-slate-600">
            {activeSummary.join(" / ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPersonalizedViewChange(!personalizedView)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
            personalizedView
              ? "bg-sky-600 text-white shadow-sm"
              : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {personalizedView ? "Personalized View On" : "Personalized View Off"}
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.5fr)]">
        <div className="space-y-4">
          <div>
            <p className="section-kicker">Time Range</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {timeRanges.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onTimeRangeChange(option.value)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    timeRange === option.value
                      ? "bg-sky-600 text-white shadow-sm"
                      : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="section-kicker">Domain</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {domains.map((domain) => (
                <button
                  key={domain}
                  type="button"
                  onClick={() => onDomainChange(domain)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                    activeDomain === domain
                      ? "bg-sky-600 text-white shadow-sm"
                      : "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {domain === "All" ? "All" : DOMAIN_LABELS[domain] ?? domain}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4">
            <p className="section-kicker">Tags</p>
            {activeTags.length ? (
              <button
                type="button"
                onClick={onClearTags}
                className="text-sm font-medium text-sky-700"
              >
                Clear tags
              </button>
            ) : null}
          </div>
          <div className="mt-3 space-y-3">
            <input
              value={tagQuery}
              onChange={(event) => onTagQueryChange(event.target.value)}
              placeholder="Search tags"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            {visibleTags.length ? (
              <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                {visibleTags.slice(0, 40).map((tag) => (
                  <Tag
                    key={tag}
                    label={tag}
                    active={activeTags.includes(tag)}
                    onClick={onTagToggle}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No matching tags.</p>
            )}
          </div>
        </div>
      </div>

      <details className="mt-4 border-t border-slate-200 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Personalization settings
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div>
            <p className="section-kicker">Preferred Domains</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {domains
                .filter((domain): domain is ArticleDomain => domain !== "All")
                .map((domain) => (
                  <Tag
                    key={`preferred-${domain}`}
                    label={domain}
                    active={profile.preferred_domains.includes(domain)}
                    onClick={() => onPreferredDomainToggle(domain)}
                  />
                ))}
            </div>
          </div>

          <div>
            <p className="section-kicker">Preferred Tags</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {availableTags.slice(0, 20).map((tag) => (
                <Tag
                  key={`preferred-tag-${tag}`}
                  label={tag}
                  active={profile.preferred_tags.includes(tag)}
                  onClick={onPreferredTagToggle}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="section-kicker">Excluded Tags</p>
              <button
                type="button"
                onClick={onClearImportanceLearning}
                className="text-xs font-medium text-sky-700 hover:text-sky-900"
              >
                Clear learned importance
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {availableTags.slice(0, 20).map((tag) => (
                <button
                  key={`excluded-tag-${tag}`}
                  type="button"
                  onClick={() => onExcludedTagToggle(tag)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    profile.excluded_tags.includes(tag)
                      ? "border-rose-600 bg-rose-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-rose-400 hover:text-rose-600"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
