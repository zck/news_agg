
import { getDomainLabel, type ScanRow } from "@/lib/scanViewModel";

function trendArrow(dir: ScanRow["trendDir"]): string {
  if (dir === "up") return "↑";
  if (dir === "down") return "↓";
  return "→";
}

export function buildTeachingMarkdown(rows: ScanRow[]): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const lines: string[] = [
    "# Tech Intelligence — Teaching Pack",
    `_${date} · ${rows.length} ${rows.length === 1 ? "story" : "stories"}_`,
    "",
  ];
  rows.forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.headline}`);
    lines.push("");
    lines.push(
      `**Domain:** ${getDomainLabel(r.domain)} · **Impact:** ${r.impact.toFixed(
        1,
      )} · **Confidence:** ${r.confidence} · **Trend:** ${trendArrow(r.trendDir)}${Math.abs(
        r.trendDelta,
      )}%`,
    );
    lines.push("");
    if (r.summary) {
      lines.push(r.summary);
      lines.push("");
    }
    if (r.whyItMatters.length) {
      lines.push("**Why it matters:**");
      r.whyItMatters.forEach((b) => lines.push(`- ${b}`));
      lines.push("");
    }
    if (r.entities.length) {
      lines.push(`**Key entities:** ${r.entities.map((e) => e.name).join(", ")}  `);
    }
    if (r.tags.length) {
      lines.push(`**Tags:** ${r.tags.map((t) => `#${t}`).join(" ")}  `);
    }
    if (r.sources.length) {
      lines.push(`**Sources:** ${r.sources.join(", ")}`);
    } else if (r.source) {
      lines.push(`**Source:** ${r.source}${r.url ? ` — ${r.url}` : ""}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  });
  return lines.join("\n");
}

export function buildSlideOutline(rows: ScanRow[]): string {
  const date = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const lines: string[] = [
    `# Slide outline — Tech Intelligence, ${date}`,
    "",
    "## Slide 1 · Title",
    `- This week in tech: ${rows.length} stories that matter`,
    "",
    "## Slide 2 · Top shifts",
    ...rows.slice(0, 3).map((r) => `- ${r.headline} _(${getDomainLabel(r.domain)})_`),
    "",
  ];
  rows.forEach((r, i) => {
    lines.push(`## Slide ${i + 3} · ${r.headline}`);
    lines.push(
      `- _${getDomainLabel(r.domain)} · Impact ${r.impact.toFixed(1)} · ${r.sourceCount} sources_`,
    );
    if (r.summary) lines.push(`- ${r.summary}`);
    if (r.whyItMatters.length) {
      lines.push("- **Why it matters:**");
      r.whyItMatters.slice(0, 3).forEach((b) => lines.push(`  - ${b}`));
    }
    lines.push("");
  });
  lines.push("## Final slide · Discussion");
  lines.push("- Which of these reshapes the next 12 months?");
  lines.push("- Where are we under-counting risk?");
  return lines.join("\n");
}

export function downloadText(filename: string, text: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function teachingFilename(prefix: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${prefix}-${today}.md`;
}
