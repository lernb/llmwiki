import { WIKI_DIR } from "../config.js";
import { listPages, readPage, writePage, pageExists } from "../storage/fileStore.js";

// ─── Wiki Link Parsing ──────────────────────────────────────────────

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g;

export interface WikiLink {
  target: string;   // slug derived from raw link text
  display: string;  // display text
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

// ─── Title-to-Slug Lookup ───────────────────────────────────────────

let _titleSlugMap: Map<string, string> | null = null;

/** Build a map of every page's title (lowercase) → slug */
function getTitleSlugMap(): Map<string, string> {
  if (!_titleSlugMap) {
    _titleSlugMap = new Map();
    for (const page of listPages()) {
      _titleSlugMap.set(page.title.toLowerCase(), page.slug);
      // Also store the display-friendly version
      _titleSlugMap.set(page.slug.replace(/-/g, " "), page.slug);
    }
  }
  return _titleSlugMap;
}

/** Invalidate the title map cache (call after page create/update/delete) */
export function invalidateTitleCache(): void {
  _titleSlugMap = null;
}

/**
 * Resolve a link target (which may be Chinese text or a slug) to a page slug.
 * Checks: direct slug match → display title match → fuzzy title match
 */
export function resolveLinkTarget(targetText: string): string | null {
  // Direct page exists check
  if (pageExists(targetText)) return targetText;

  // Normalized slug
  const slug = targetText.toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-");
  if (pageExists(slug)) return slug;

  // Title map lookup
  const map = getTitleSlugMap();
  const match = map.get(targetText.toLowerCase());
  if (match) return match;

  // Also try with the display text minus hyphens (in case display has spaces)
  const noHyphen = targetText.toLowerCase().replace(/-/g, " ");
  const match2 = map.get(noHyphen);
  if (match2) return match2;

  return null;
}

// ─── Backlinks ───────────────────────────────────────────────────────

export interface Backlink {
  slug: string;
  title: string;
  context: string;
}

export function getBacklinks(slug: string): Backlink[] {
  const page = listPages().find((p) => p.slug === slug);
  const titleLower = page?.title.toLowerCase() || "";
  const backlinks: Backlink[] = [];

  for (const p of listPages()) {
    if (p.slug === slug) continue;
    const content = readPage(p.slug);
    if (!content) continue;

    WIKI_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKI_LINK_RE.exec(content)) !== null) {
      const rawTarget = match[1].trim().toLowerCase();
      // Check if this link points to the current page by slug or title
      const resolved = resolveLinkTarget(rawTarget);
      if (resolved === slug) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(content.length, match.index + match[0].length + 40);
        const context = content.slice(start, end).replace(/\n/g, " ").trim();
        backlinks.push({ slug: p.slug, title: p.title, context });
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
      // Resolve the link target to an actual page slug
      const target = resolveLinkTarget(link.target);
      if (target && target !== page.slug && nodeMap.has(target)) {
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

  const content = `# 欢迎来到 LLM Wiki

这是你的**持久化知识库**，由 LLM 从源文件中编译而成。

## 快速开始

1. 前往 **源文件** 页面上传文档
2. 运行 **消化** 让 LLM 读取源文件并构建 Wiki 页面
3. 浏览互联的 Wiki 页面，观察知识图谱的增长

## 小技巧

- 使用 [[wiki 链接]] 连接相关概念
- \`agents.md\` 文件控制 LLM 如何构建 Wiki
- 每次消化会更新已有页面并创建新页面
`;
  writePage("index", content);
  return "index";
}

// ─── Page Resolution ────────────────────────────────────────────────

export function resolvePage(slugOrTitle: string): string | null {
  return resolveLinkTarget(slugOrTitle);
}

// ─── Fix Broken Links ───────────────────────────────────────────────

/**
 * Scan all wiki pages for [[links]] that don't resolve to any page.
 * Create minimal stub pages for them so there are no dead links.
 * Call this after every ingestion.
 *
 * Returns the number of stub pages created.
 */
export function fixBrokenLinks(): number {
  const pages = listPages();
  let stubsCreated = 0;

  for (const page of pages) {
    const content = readPage(page.slug);
    if (!content) continue;

    WIKI_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();

    while ((match = WIKI_LINK_RE.exec(content)) !== null) {
      const rawTarget = match[1].trim();
      const display = (match[2]?.trim()) || rawTarget;

      // Skip if we already handled this link text
      if (seen.has(rawTarget)) continue;
      seen.add(rawTarget);

      // Try to resolve the link
      const resolved = resolveLinkTarget(rawTarget);
      if (resolved) continue; // link is valid

      // Link is broken — create a stub page
      const slug = rawTarget.toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-");
      // Only create if not already existing after slugification
      if (pageExists(slug)) continue;

      const stubContent = `# ${display}

> 此页面为自动创建的占位页面，相关内容尚未收录。

**来源链接：** [[${page.title}]]

此概念在 [[${page.title}]] 中被提及，但尚未有独立页面。请上传相关源文件并消化以补充内容。
`;
      writePage(slug, stubContent);
      stubsCreated++;
    }
  }

  return stubsCreated;
}
