
"use client";

import { useMemo, useState } from "react";
import { ImportanceEditor } from "@/components/ImportanceEditor";
import { Tag } from "@/components/Tag";
import type { ImportanceLearningProfile } from "@/lib/feedback";
import {
  getLearnedAdjustment,
  getLearningExplanation,
} from "@/lib/feedback";
import type { Article, ArticleDomain, ImportanceFeedback } from "@/lib/types";

const PAGE_SIZE = 25;

type ArticleFeedProps = {
  articles: Article[];
  activeTags: string[];
  personalizedView: boolean;
  scoreLookup?: Map<string, number>;
  feedbackMap?: Record<string, ImportanceFeedback>;
  learningProfile?: ImportanceLearningProfile;
  selectedIds?: Set<string>;
  onTagClick: (tag: string) => void;
  onImportanceChange: (
    article: Article,
    userImportance: 1 | 2 | 3 | 4 | 5,
  ) => void;
  onImportanceReset: (article: Article) => void;
  onToggleSelect?: (articleId: string) => void;
};

export function ArticleFeed({
  articles,
  activeTags,
  personalizedView,
  scoreLookup,
  feedbackMap = {},
  learningProfile,
  selectedIds,
  onTagClick,
  onImportanceChange,
  onImportanceReset,
  onToggleSelect,
}: ArticleFeedProps) {
  const selectable = typeof onToggleSelect === "function";
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => articles.slice(0, visibleCount),
    [articles, visibleCount],
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!articles.length) {
    return null;
  }

  return (
    <section className="surface-card p-4 sm:p-6">
      <div className="flex items-end justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <p className="section-kicker">Article Feed</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">
            All Articles
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Rate articles to teach the system what matters to you.
          </p>
        </div>
        <span className="shrink-0 text-sm text-slate-500">
          {articles.length} article{articles.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 divide-y divide-slate-100">
        {visible.map((article) => {
          const isExpanded = expandedIds.has(article.id);
          const feedback = feedbackMap[article.id];
          const score = personalizedView
            ? scoreLookup?.get(article.id)
            : undefined;

          const isSelected = selectedIds?.has(article.id) ?? false;

          return (
            <div
              key={article.id}
              className={`group py-3 first:pt-0 last:pb-0 ${
                isSelected ? "rounded-lg bg-sky-50/60 px-2 -mx-2" : ""
              }`}
            >
              {/* Row 1: metadata + importance */}
              <div className="flex items-start gap-3">
                {selectable ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect?.(article.id)}
                    aria-label={`Select article: ${article.headline}`}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-sky-600"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                      {article.domain}
                    </span>
                    {article.source ? (
                      <span className="truncate">{article.source}</span>
                    ) : null}
                    <span>{article.date}</span>
                  </div>

                  {/* Headline — clickable to expand */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(article.id)}
                    className="mt-1 text-left text-[15px] font-semibold leading-snug text-slate-900 hover:text-sky-700"
                  >
                    {article.headline}
                  </button>
                </div>

                {/* Importance editor on the right */}
                <div className="shrink-0">
                  <ImportanceEditor
                    article={article}
                    feedback={feedback}
                    score={score}
                    learnedAdjustment={
                      learningProfile
                        ? getLearnedAdjustment(article, learningProfile)
                        : 0
                    }
                    learningExplanation={
                      personalizedView && learningProfile
                        ? getLearningExplanation(article, learningProfile)
                        : null
                    }
                    onSetImportance={onImportanceChange}
                    onResetImportance={onImportanceReset}
                  />
                </div>
              </div>

              {/* Tags row */}
              {article.tags?.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {article.tags.slice(0, 5).map((tag) => (
                    <Tag
                      key={tag}
                      label={tag}
                      active={activeTags.includes(tag)}
                      onClick={onTagClick}
                    />
                  ))}
                  {article.tags.length > 5 ? (
                    <span className="text-xs text-slate-400">
                      +{article.tags.length - 5}
                    </span>
                  ) : null}
                  {article.url ? (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-xs font-medium text-sky-700 opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                    >
                      Open ↗
                    </a>
                  ) : null}
                </div>
              ) : null}

              {/* Expanded: summary + link */}
              {isExpanded ? (
                <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                  <p>{article.summary}</p>
                  {article.url ? (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-sm font-medium text-sky-700 hover:underline"
                    >
                      Read full article ↗
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {visibleCount < articles.length ? (
        <div className="mt-4 flex items-center justify-center gap-4 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-sky-300 hover:text-sky-700"
          >
            Show {Math.min(PAGE_SIZE, articles.length - visibleCount)} more
          </button>
          <button
            type="button"
            onClick={() => setVisibleCount(articles.length)}
            className="text-sm font-medium text-slate-500 hover:text-sky-700"
          >
            Show all ({articles.length - visibleCount} remaining)
          </button>
        </div>
      ) : null}
    </section>
  );
}
