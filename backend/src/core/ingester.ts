/**
 * LLM Ingestion Pipeline.
 *
 * Reads a source document, sends it to the LLM along with agents.md instructions,
 * and the LLM returns structured wiki pages to create/update.
 */

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);

import { AGENTS_FILE } from "../config.js";
import { readSource, readSourceBuffer } from "../storage/fileStore.js";
import { chat } from "./llm.js";
import { readPage, writePage, pageExists, listPages } from "../storage/fileStore.js";
import { buildIndex } from "./search.js";
import { recordIngestion, removeIngestRecord } from "../storage/ingestMeta.js";
import { invalidateTitleCache } from "./engine.js";

// ─── Cancellation tracking ──────────────────────────────────────────
const abortControllers = new Map<string, AbortController>();

export function cancelIngestion(filename: string): boolean {
  const controller = abortControllers.get(filename);
  if (!controller) return false;
  controller.abort();
  abortControllers.delete(filename);
  return true;
}

export function cancelAllIngestions(): number {
  const count = abortControllers.size;
  for (const [name] of abortControllers) {
    abortControllers.get(name)?.abort();
  }
  abortControllers.clear();
  return count;
}

// ─── Types ──────────────────────────────────────────────────────────

export interface IngestResult {
  status: "success" | "error" | "cancelled";
  message: string;
  pagesCreated: string[];
  pagesUpdated: string[];
  sourceFile: string;
}

interface PageAction {
  action: "create" | "update";
  slug: string;
  title: string;
  content: string;
}

// ─── Default System Prompt ─────────────────────────────────────────

export function loadAgentsMd(): string {
  if (existsSync(AGENTS_FILE)) {
    return readFileSync(AGENTS_FILE, "utf-8");
  }
  // Built-in default
  return `You are a wiki librarian. Your job is to read source documents and compile knowledge into structured, interconnected wiki pages in Markdown format.

IMPORTANT: All wiki content must be written in Chinese (简体中文). Page titles, content, and links should all be in Chinese. Only technical terms may remain in English.

Rules:
1. Create ONE page per major concept/entity with Chinese titles.
2. Use # Chinese heading for titles, ## Chinese heading for sections.
3. Use [[Chinese Page Name]] to link related concepts.
4. If a page for a concept already exists, UPDATE it with new info — don't create duplicates.
5. Note contradictions with > **注意：** blocks.
6. Be concise and factual.
7. Every page should link to at least 2-3 other pages.
8. Create or update an index.md that serves as a table of contents.`;
}

// ─── Build the ingestion prompt ─────────────────────────────────────

function buildIngestionPrompt(
  sourceContent: string,
  sourceFilename: string,
  existingPageList: string
): string {
  return `I'm going to give you a source document. Please analyze it and compile its knowledge into wiki pages.

## Source Document
**Filename:** ${sourceFilename}

\`\`\`
${sourceContent}
\`\`\`

## Existing Wiki Pages
These pages already exist. UPDATE them if new information is relevant, rather than creating duplicates.

${existingPageList || "(empty wiki)"}

## Your Task

Return a JSON object with the following structure — and ONLY valid JSON, no extra text:

\`\`\`json
{
  "pages": [
    {
      "action": "create" or "update",
      "slug": "page-url-slug",
      "title": "Page Title",
      "content": "# Page Title\\n\\nFull markdown content with [[Wiki Links]]..."
    }
  ]
}
\`\`\`

Guidelines:
- **CRITICAL: Write page titles, headings, and content in Chinese (简体中文).** Only technical terms may stay in English.
- **Be comprehensive.** Extract all important details, data, and insights from the source. Pages should be detailed — aim for 300-1000 words per page depending on the source richness.
- Use multiple sections (\`## Section\`, \`### Subsection\`) to organize information.
- Each page should be self-contained Markdown with proper structure.
- Use [[Wiki Links]] to connect related concepts.
- For existing pages, return "action": "update" with the FULL new content (not just a diff).
- Create 3-8 pages as needed to fully cover the source content.
- The first page should be the most important concept from this source.`;
}

// ─── Parse LLM response ────────────────────────────────────────────

function parseIngestionResponse(text: string): PageAction[] {
  // Try to extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*"pages"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.pages && Array.isArray(parsed.pages)) {
        return parsed.pages as PageAction[];
      }
    } catch {
      // JSON parse failed, fall through to markdown parsing
    }
  }

  // Fallback: treat entire response as a single page
  // Extract a title from the first # heading
  const lines = text.split("\n");
  let title = "Untitled Page";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") && !trimmed.startsWith("##")) {
      title = trimmed.slice(2).trim();
      break;
    }
  }

  const slug = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
  return [
    {
      action: pageExists(slug) ? "update" : "create",
      slug,
      title,
      content: text,
    },
  ];
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const MAX_CHUNK_CHARS = 200000;
const INGEST_MAX_TOKENS = 32768;

function getMime(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
    ".gif": "image/gif", ".bmp": "image/bmp",
  };
  return map[ext] || "application/octet-stream";
}

/** Split text at heading boundaries, each chunk ≤ MAX_CHUNK_CHARS. */
function chunkByHeadings(text: string): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = trimmed.length >= 2 && trimmed.length <= 60
      && /^[\u4e00-\u9fffA-Z\d]/.test(trimmed)
      && !trimmed.endsWith("：") && !trimmed.endsWith(":")
      && !/^[\d\s.\-—·•]+$/.test(trimmed);

    if (currentLen + line.length + 1 > MAX_CHUNK_CHARS && currentLen > 30000 && isHeading) {
      chunks.push(current.join("\n"));
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += line.length + 1;
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks;
}

/** Check if a PDF is likely a scan (many pages, little text). */
function isScanPdf(pdfData: { numpages: number; text: string }): boolean {
  return pdfData.numpages > 1 && pdfData.numpages * 50 > pdfData.text.length;
}

function buildChunkPrompt(chunk: string, chunkIndex: number, chunkTotal: number, filename: string, existingPageList: string): string {
  return `请分析源文档的第 ${chunkIndex}/${chunkTotal} 部分，将其知识编译成结构化的 Wiki 页面。

## 源文档（第 ${chunkIndex} 部分）
**文件名：** ${filename}

\`\`\`
${chunk}
\`\`\`

## 已有 Wiki 页面
${existingPageList || "(空 Wiki)"}

请返回 JSON 格式（只有 JSON）：

\`\`\`json
{
  "pages": [
    {
      "action": "create" 或 "update",
      "slug": "页面-slug",
      "title": "页面标题",
      "content": "# 页面标题\\n\\n完整 Markdown 内容..."
    }
  ]
}
\`\`\`

指南：
- **中文写页面**，技术术语保留英文
- 使用 ## 和 ### 组织多级标题
- 使用 [[Wiki 链接]] 连接相关概念
- 已有页面如果相关请 UPDATE 而不是创建重复
- 每页简洁，不超过 500 字
- 创建适合该部分内容的页面数`;
}

function buildCrossLinkPrompt(pages: Array<{ slug: string; title: string; excerpt: string }>): string {
  const list = pages.map((p) => `- ${p.title} (${p.slug}): ${p.excerpt}`).join("\n");
  return `以下是 Wiki 中已有的页面列表。请分析它们之间的关联，返回需要添加 [[互相链接]] 的页面对。

已有页面：
${list}

返回 JSON：
\`\`\`json
{
  "links": [
    { "from": "slug-a", "to": "slug-b" },
    { "from": "slug-a", "to": "slug-c" }
  ]
}
\`\`\`

规则：
- from 和 to 必须是列表中的 slug
- 只返回有意义的概念关联（同主题、父子关系、相关功能）
- 不要返回已经明显互相链接的页面
- 每种关联只返回一次（不重复）`;
}

// ─── Ingestion entry point ──────────────────────────────────────────

export async function ingestSource(filename: string): Promise<IngestResult> {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);

  if (isImage) {
    return ingestImageSource(filename);
  }

  // Read source content + PDF metadata
  const sourceContent = await readSource(filename);
  if (!sourceContent) {
    removeIngestRecord(filename);
    return { status: "error", message: `源文件 '${filename}' 不存在`, pagesCreated: [], pagesUpdated: [], sourceFile: filename };
  }

  // PDF scan detection
  if (ext === ".pdf") {
    const pdfParse = _require("pdf-parse");
    const buf = readSourceBuffer(filename);
    if (buf) {
      try {
        const pdfData = await pdfParse(buf);
        if (isScanPdf(pdfData)) {
          removeIngestRecord(filename);
          return { status: "error", message: `「${filename}」可能为扫描件，提取文字较少（${pdfData.text.length} 字符 / ${pdfData.numpages} 页），请上传清晰的文本版 PDF。`, pagesCreated: [], pagesUpdated: [], sourceFile: filename };
        }
      } catch {}
    }
  }

  // Decide single vs chunked
  if (sourceContent.length <= MAX_CHUNK_CHARS) {
    return digestSingle(filename, sourceContent);
  }

  return digestChunked(filename, sourceContent);
}

async function digestSingle(filename: string, sourceContent: string): Promise<IngestResult> {
  const existingPages = listPages().map((p) => `- [[${p.title}]] (${p.slug})`).join("\n");
  const systemPrompt = loadAgentsMd();
  const userPrompt = buildIngestionPrompt(sourceContent, filename, existingPages);

  const controller = new AbortController();
  abortControllers.set(filename, controller);

  try {
    const response = await chat(
      [{ role: "user", content: userPrompt }],
      { system: systemPrompt, temperature: 0.3, maxTokens: INGEST_MAX_TOKENS, signal: controller.signal }
    );
    abortControllers.delete(filename);
    return processChatResponse(response, filename);
  } catch (e: any) {
    abortControllers.delete(filename);
    return handleError(e, filename);
  }
}

async function digestChunked(filename: string, sourceContent: string): Promise<IngestResult> {
  const systemPrompt = loadAgentsMd();
  const chunks = chunkByHeadings(sourceContent);
  const allPages: PageAction[] = [];

  // Phase 1+2: chunk and parallel digest
  const controller = new AbortController();
  abortControllers.set(filename, controller);

  try {
    const results: PageAction[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const existing = listPages().map((p) => `- [[${p.title}]] (${p.slug})`).join("\n");
      const prompt = buildChunkPrompt(chunk, i + 1, chunks.length, filename, existing);
      const response = await chat(
        [{ role: "user", content: prompt }],
        { system: systemPrompt, temperature: 0.3, maxTokens: INGEST_MAX_TOKENS, signal: controller.signal }
      );
      const pages = parseIngestionResponse(response);
      results.push(pages);
    }

    abortControllers.delete(filename);
    for (const pages of results) {
      allPages.push(...pages);
    }
  } catch (e: any) {
    abortControllers.delete(filename);
    return handleError(e, filename);
  }

  // Phase 3: save all pages
  const created: string[] = [];
  const updated: string[] = [];
  for (const action of allPages) {
    if (!action.slug || !action.content) continue;
    const slug = action.slug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
    if (action.action === "create" || !pageExists(slug)) {
      created.push(slug);
    } else {
      updated.push(slug);
    }
    writePage(slug, action.content);
  }

  buildIndex();
  invalidateTitleCache();

  // Phase 4: cross-link (only if multiple chunks)
  if (chunks.length > 1 && created.length + updated.length > 1) {
    await crossLinkPages();
  }

  recordIngestion(filename, "success", created, updated);
  return {
    status: "success",
    message: `已处理 '${filename}'（${chunks.length} 块）: ${created.length} 创建, ${updated.length} 更新`,
    pagesCreated: created,
    pagesUpdated: updated,
    sourceFile: filename,
  };
}

async function crossLinkPages(): Promise<void> {
  const all = listPages();
  if (all.length < 2) return;

  const pages = all.slice(0, 60).map((p) => {
    const content = readPage(p.slug) || "";
    const excerpt = content.replace(/[#*`\[\]]/g, "").trim().slice(0, 150).replace(/\n/g, " ");
    return { slug: p.slug, title: p.title, excerpt };
  });

  const prompt = buildCrossLinkPrompt(pages);
  const systemPrompt = loadAgentsMd();

  try {
    const response = await chat(
      [{ role: "user", content: prompt }],
      { system: systemPrompt, temperature: 0.3, maxTokens: 4096 }
    );

    const jsonMatch = response.match(/\{[\s\S]*"links"[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.links || !Array.isArray(parsed.links)) return;

    // Group links by "from" slug
    const linkMap = new Map<string, string[]>();
    for (const link of parsed.links) {
      if (!link.from || !link.to) continue;
      if (!linkMap.has(link.from)) linkMap.set(link.from, []);
      linkMap.get(link.from)!.push(link.to);
    }

    // Append ## 参见 to each page
    for (const [from, toSlugs] of linkMap) {
      const content = readPage(from);
      if (!content) continue;
      const titles = toSlugs
        .map((s) => all.find((p) => p.slug === s))
        .filter(Boolean)
        .map((p) => `- [[${p!.title}]]`);
      if (titles.length === 0) continue;
      const seeAlso = "\n\n## 参见\n" + titles.join("\n");
      writePage(from, content + seeAlso);
    }
  } catch {
    // Cross-linking is best-effort
  }
}

async function ingestImageSource(filename: string): Promise<IngestResult> {
  const existingPages = listPages().map((p) => `- [[${p.title}]] (${p.slug})`).join("\n");
  const systemPrompt = loadAgentsMd();

  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  const mime = getMime(ext);
  const buf = readSourceBuffer(filename);
  if (!buf) {
    removeIngestRecord(filename);
    return { status: "error", message: `源文件 '${filename}' 不存在`, pagesCreated: [], pagesUpdated: [], sourceFile: filename };
  }

  const b64 = buf.toString("base64");
  const textPrompt = `请分析这张图片中的内容，并将其整理到 Wiki 中。

## 已有 Wiki 页面
这些页面已存在，如果新的信息相关请 UPDATE 而不是创建重复页面。

${existingPages || "(空 Wiki)"}

请返回 JSON 格式（只有 JSON，不要额外文字）：
\`\`\`json
{
  "pages": [
    {
      "action": "create" 或 "update",
      "slug": "页面-slug",
      "title": "页面标题",
      "content": "# 页面标题\\n\\nMarkdown 内容..."
    }
  ]
}
\`\`\`

指南：
- 全面提取图片中的文字和信息
- 使用中文写页面，技术术语可保留英文
- 每页用 ## 和 ### 组织多级标题
- 使用 [[Wiki 链接]] 连接相关概念
- 创建 1-5 个页面`;

  const messageContent: Array<Record<string, any>> = [
    { type: "text", text: textPrompt },
    { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
  ];

  const controller = new AbortController();
  abortControllers.set(filename, controller);

  try {
    const response = await chat(
      [{ role: "user", content: messageContent }],
      { system: systemPrompt, temperature: 0.3, maxTokens: INGEST_MAX_TOKENS, signal: controller.signal }
    );
    abortControllers.delete(filename);
    return processChatResponse(response, filename);
  } catch (e: any) {
    abortControllers.delete(filename);
    const aborted = e.name === "AbortError" || e.message?.includes("abort");
    recordIngestion(filename, "error", [], []);
    return {
      status: aborted ? "cancelled" : "error",
      message: aborted ? "已取消消化" : `LLM 不支持图片分析: ${e.message}`,
      pagesCreated: [],
      pagesUpdated: [],
      sourceFile: filename,
    };
  }
}

function processChatResponse(response: string, filename: string): IngestResult {
  const pageActions = parseIngestionResponse(response);
  const created: string[] = [];
  const updated: string[] = [];

  for (const action of pageActions) {
    if (!action.slug || !action.content) continue;
    const slug = action.slug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
    if (action.action === "create" || !pageExists(slug)) {
      created.push(slug);
    } else {
      updated.push(slug);
    }
    writePage(slug, action.content);
  }

  buildIndex();
  invalidateTitleCache();
  recordIngestion(filename, "success", created, updated);

  return {
    status: "success",
    message: `已处理 '${filename}': ${created.length} 创建, ${updated.length} 更新`,
    pagesCreated: created,
    pagesUpdated: updated,
    sourceFile: filename,
  };
}

function handleError(e: any, filename: string): IngestResult {
  const aborted = e.name === "AbortError" || e.message?.includes("abort");
  recordIngestion(filename, "error", [], []);
  return {
    status: aborted ? "cancelled" : "error",
    message: aborted ? "已取消消化" : `消化失败: ${e.message}`,
    pagesCreated: [],
    pagesUpdated: [],
    sourceFile: filename,
  };
}

export async function ingestAllSources(): Promise<IngestResult[]> {
  const { listSources } = await import("../storage/fileStore.js");
  const sources = listSources();
  const results: IngestResult[] = [];

  for (const src of sources) {
    const result = await ingestSource(src.filename);
    results.push(result);
  }

  return results;
}
