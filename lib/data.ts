import { Article, ArticleDomain } from "@/lib/types";

export const dashboardGroups = [
  { title: "AI Use", domains: ["AIUse"] },
  { title: "LLM", domains: ["LLM"] },
  { title: "AI Infra", domains: ["AIInfra"] },
  { title: "Semis", domains: ["Semis"] },
  { title: "Cloud", domains: ["Cloud"] },
  { title: "Security", domains: ["Security"] },
  { title: "Consumer", domains: ["Consumer"] },
  { title: "Bio", domains: ["Bio"] },
  { title: "Climate", domains: ["Climate"] },
  { title: "Crypto", domains: ["Crypto"] },
  { title: "Policy", domains: ["Policy"] },
  { title: "Space", domains: ["Space"] },
  { title: "Robotics", domains: ["Robotics"] },
  { title: "Batteries", domains: ["Batteries"] },
  { title: "AR", domains: ["AR"] },
  { title: "Materials", domains: ["Materials"] },
  { title: "General", domains: ["General"] },
] satisfies { title: string; domains: ArticleDomain[] }[];

export const fallbackArticles: Article[] = [];
