import { WIKI_DIR } from "../config.js";
import { listPages, readPage, writePage, pageExists } from "../storage/fileStore.js";

// ─── Wiki Link Parsing ──────────────────────────────────────────────

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g;

export interface WikiLink {
  target: string;
  display: string;
}

export function parseLinks(markdown: string): WikiLink[] {
  const links: WikiLink[] = [];
  let match: RegExpExecArray | null;
  WIKI_LINK_RE.lastIndex = 0;
  while ((match = WIKI_LINK_RE.exec(markdown)) !== null) {
    const rawTarget = match[1].trim();
    const display = (match[2]?.trim()) || rawTarget;
    const slug = rawTarget.toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-");
    links.push({ target: slug, display });
  }
  return links;
}

// ─── Backlinks ───────────────────────────────────────────────────────

export interface Backlink {
  slug: string;
  title: string;
  context: string;
}

export function getBacklinks(slug: string): Backlink[] {
  const targetVariants = new Set([slug, slug.replace(/-/g, " ")]);
  const backlinks: Backlink[] = [];

  for (const page of listPages()) {
    if (page.slug === slug) continue;
    const content = readPage(page.slug);
    if (!content) continue;

    WIKI_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKI_LINK_RE.exec(content)) !== null) {
      const rawTarget = match[1].trim().toLowerCase();
      const targetSlug = rawTarget.replace(/\s+/g, "-").replace(/\//g, "-");
      if (targetVariants.has(targetSlug)) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(content.length, match.index + match[0].length + 40);
        const context = content.slice(start, end).replace(/\n/g, " ").trim();
        backlinks.push({ slug: page.slug, title: page.title, context });
        break;
      }
    }
  }

  return backlinks;
}

// ─── Knowledge Graph ────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  size: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function getGraphData(): GraphData {
  const pages = listPages();
  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const page of pages) {
    nodeMap.set(page.slug, { id: page.slug, label: page.title, size: page.size });
  }

  for (const page of pages) {
    const content = readPage(page.slug);
    if (!content) continue;
    for (const link of parseLinks(content)) {
      const target = link.target;
      if (nodeMap.has(target) || pageExists(target)) {
        edges.push({ source: page.slug, target, label: link.display });
      }
    }
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

// ─── Index Page ─────────────────────────────────────────────────────

export function ensureIndexPage(): string {
  const pages = listPages();
  if (pages.length > 0) return pages[0].slug;

  const content = `# Welcome to LLM Wiki

This is your **persistent knowledge base**, compiled from source documents by an LLM.

## Getting Started

1. Upload source documents (papers, articles, notes) via the **Sources** page.
2. Run **Ingest** to have the LLM read your sources and build wiki pages.
3. Browse the interconnected wiki pages and watch your knowledge graph grow.

## Tips

- Use [[wiki links]] to connect related concepts.
- The \`agents.md\` file controls how the LLM structures the wiki.
- Each ingestion updates existing pages and creates new ones as needed.
`;
  writePage("index", content);
  return "index";
}

// ─── Page Resolution ────────────────────────────────────────────────

export function resolvePage(slugOrTitle: string): string | null {
  // Direct slug match
  if (pageExists(slugOrTitle)) return slugOrTitle;

  // Normalize and try
  const slug = slugOrTitle.toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-");
  if (pageExists(slug)) return slug;

  // Search by title
  for (const page of listPages()) {
    if (page.title.toLowerCase() === slugOrTitle.toLowerCase()) return page.slug;
  }

  return null;
}
