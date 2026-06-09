// /Users/montysharma/Projects/news_agg/news_agg/lib/sources.ts

import { ArticleDomain } from "@/lib/types";

export type RssSource = {
  name: string;
  url: string;
  category: ArticleDomain;
};

export const sources: RssSource[] = [
  // ── LLM: major model labs + research ────────────────────
  { name: "OpenAI Blog", url: "https://openai.com/blog/rss.xml", category: "LLM" },
  { name: "Anthropic Blog", url: "https://www.anthropic.com/feed.xml", category: "LLM" },
  { name: "DeepMind", url: "https://www.deepmind.com/blog/rss.xml", category: "LLM" },
  { name: "Google AI Blog", url: "https://blog.research.google/feeds/posts/default?alt=rss", category: "LLM" },
  { name: "Meta AI Blog", url: "https://ai.meta.com/blog/rss/", category: "LLM" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", category: "LLM" },
  { name: "Arxiv AI", url: "http://export.arxiv.org/rss/cs.AI", category: "LLM" },
  { name: "The Batch (deeplearning.ai)", url: "https://www.deeplearning.ai/the-batch/feed/", category: "LLM" },

  // ── AI Use: consumer apps, tips, what people are doing ───
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/", category: "AIUse" },
  { name: "AI News", url: "https://www.artificialintelligence-news.com/feed/", category: "AIUse" },

  // ── Semiconductors ──────────────────────────────────────
  { name: "Semiconductor Engineering", url: "https://semiengineering.com/feed/", category: "Semis" },
  { name: "EE Times", url: "https://www.eetimes.com/feed/", category: "Semis" },
  { name: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all", category: "Semis" },
  { name: "SemiAnalysis", url: "https://www.semianalysis.com/feed", category: "Semis" },
  { name: "WikiChip", url: "https://fuse.wikichip.org/feed/", category: "Semis" },
  { name: "ServeTheHome", url: "https://www.servethehome.com/feed/", category: "Semis" },

  // ── Cloud & Infrastructure ──────────────────────────────
  { name: "Data Center Knowledge", url: "https://www.datacenterknowledge.com/rss.xml", category: "Cloud" },
  { name: "The New Stack", url: "https://thenewstack.io/feed/", category: "Cloud" },
  { name: "InfoQ", url: "https://feed.infoq.com/", category: "Cloud" },
  { name: "AWS Blog", url: "https://aws.amazon.com/blogs/aws/feed/", category: "Cloud" },
  { name: "Google Cloud Blog", url: "https://cloud.google.com/blog/feed/", category: "Cloud" },
  { name: "Azure Blog", url: "https://azure.microsoft.com/en-us/blog/feed/", category: "Cloud" },
  { name: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/", category: "Cloud" },

  // ── Security ────────────────────────────────────────────
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", category: "Security" },
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", category: "Security" },
  { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml", category: "Security" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", category: "Security" },
  { name: "Schneier on Security", url: "https://www.schneier.com/feed/atom/", category: "Security" },

  // ── Consumer ────────────────────────────────────────────
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "Consumer" },
  { name: "9to5Mac", url: "https://9to5mac.com/feed/", category: "Consumer" },
  { name: "9to5Google", url: "https://9to5google.com/feed/", category: "Consumer" },
  { name: "MacRumors", url: "https://feeds.macrumors.com/MacRumors-All", category: "Consumer" },

  // ── Bio ─────────────────────────────────────────────────
  { name: "Nature Biotechnology", url: "https://www.nature.com/nbt.rss", category: "Bio" },
  { name: "STAT News", url: "https://www.statnews.com/feed/", category: "Bio" },
  { name: "Endpoints News", url: "https://endpts.com/feed/", category: "Bio" },
  { name: "Fierce Biotech", url: "https://www.fiercebiotech.com/rss/xml", category: "Bio" },

  // ── Climate ─────────────────────────────────────────────
  { name: "Canary Media", url: "https://www.canarymedia.com/feed", category: "Climate" },
  { name: "Electrek", url: "https://electrek.co/feed/", category: "Climate" },
  { name: "Utility Dive", url: "https://www.utilitydive.com/feeds/news/", category: "Climate" },
  { name: "CleanTechnica", url: "https://cleantechnica.com/feed/", category: "Climate" },

  // ── Crypto ──────────────────────────────────────────────
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", category: "Crypto" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml", category: "Crypto" },

  // ── Policy ──────────────────────────────────────────────
  { name: "Techdirt", url: "https://www.techdirt.com/feed/", category: "Policy" },
  { name: "EFF Deeplinks", url: "https://www.eff.org/rss/updates.xml", category: "Policy" },
  { name: "Lawfare", url: "https://www.lawfaremedia.org/feed", category: "Policy" },

  // ── Space ───────────────────────────────────────────────
  { name: "SpaceNews", url: "https://spacenews.com/feed/", category: "Space" },
  { name: "NASA Spaceflight", url: "https://www.nasaspaceflight.com/feed/", category: "Space" },
  { name: "Ars Technica Space", url: "https://feeds.arstechnica.com/arstechnica/science", category: "Space" },

  // ── Robotics ────────────────────────────────────────────
  { name: "IEEE Spectrum Robotics", url: "https://spectrum.ieee.org/feeds/topic/robotics.rss", category: "Robotics" },
  { name: "The Robot Report", url: "https://www.therobotreport.com/feed/", category: "Robotics" },

  // ── AR / VR ─────────────────────────────────────────────
  { name: "Road to VR", url: "https://www.roadtovr.com/feed/", category: "AR" },
  { name: "UploadVR", url: "https://www.uploadvr.com/feed/", category: "AR" },

  // ── Materials Science ───────────────────────────────────
  { name: "Materials Today", url: "https://www.materialstoday.com/rss/news/", category: "Materials" },
  { name: "ScienceDaily Materials", url: "https://www.sciencedaily.com/rss/matter_energy/materials_science.xml", category: "Materials" },
  { name: "ScienceDaily Nanotech", url: "https://www.sciencedaily.com/rss/matter_energy/nanotechnology.xml", category: "Materials" },
  { name: "Phys.org Condensed Matter", url: "https://phys.org/rss-feed/physics-news/condensed-matter/", category: "Materials" },
  { name: "Arxiv Materials Science", url: "http://export.arxiv.org/rss/cond-mat.mtrl-sci", category: "Materials" },

  // ── General ─────────────────────────────────────────────
  { name: "Hacker News (Best)", url: "https://hnrss.org/best", category: "General" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "General" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "General" },
  { name: "Wired", url: "https://www.wired.com/feed/rss", category: "General" },
  { name: "Techmeme", url: "https://www.techmeme.com/feed.xml", category: "General" },
  { name: "VentureBeat", url: "https://feeds.feedburner.com/venturebeat/SZYF", category: "General" },
  { name: "The Register", url: "https://www.theregister.com/headlines.atom", category: "General" },
  { name: "Slashdot", url: "http://rss.slashdot.org/Slashdot/slashdotMain", category: "General" },
  { name: "Reuters Tech", url: "https://www.reutersagency.com/feed/?best-topics=technology", category: "General" },
  { name: "CNBC Tech", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910", category: "General" },
  { name: "Science Daily Tech", url: "https://www.sciencedaily.com/rss/computers_math/technology.xml", category: "General" },
];
