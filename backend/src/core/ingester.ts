/**
 * LLM Ingestion Pipeline.
 *
 * Reads a source document, sends it to the LLM along with agents.md instructions,
 * and the LLM returns structured wiki pages to create/update.
 */

import { readFileSync, existsSync } from "node:fs";
import { AGENTS_FILE } from "../config.js";
import { readSource } from "../storage/fileStore.js";
import { chat } from "./llm.js";
import { readPage, writePage, pageExists, listPages } from "../storage/fileStore.js";
import { buildIndex } from "./search.js";
import { recordIngestion, removeIngestRecord } from "../storage/ingestMeta.js";
import { invalidateTitleCache, fixBrokenLinks } from "./engine.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface IngestResult {
  status: "success" | "error";
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
${sourceContent.slice(0, 30000)}
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

// ─── Ingestion entry point ──────────────────────────────────────────

export async function ingestSource(filename: string): Promise<IngestResult> {
  const sourceContent = await readSource(filename);
  if (!sourceContent) {
    removeIngestRecord(filename);
    return {
      status: "error",
      message: `Source file '${filename}' not found`,
      pagesCreated: [],
      pagesUpdated: [],
      sourceFile: filename,
    };
  }

  // Build list of existing pages for context
  const existingPages = listPages().map((p) => `- [[${p.title}]] (${p.slug})`).join("\n");

  // Load agents.md as system prompt
  const systemPrompt = loadAgentsMd();

  // Build the user prompt
  const userPrompt = buildIngestionPrompt(sourceContent, filename, existingPages);

  try {
    const response = await chat(
      [{ role: "user", content: userPrompt }],
      { system: systemPrompt, temperature: 0.3, maxTokens: 8192 }
    );

    const pageActions = parseIngestionResponse(response);
    const created: string[] = [];
    const updated: string[] = [];

    for (const action of pageActions) {
      if (!action.slug || !action.content) continue;

      // Sanitize slug
      const slug = action.slug.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");

      writePage(slug, action.content);

      if (action.action === "create" || !pageExists(slug)) {
        created.push(slug);
      } else {
        updated.push(slug);
      }
    }

    // Fix any broken wiki links by creating stub pages
    const stubsFixed = fixBrokenLinks();
    if (stubsFixed > 0) {
      console.log(`📎 自动创建 ${stubsFixed} 个占位页面（修复断裂链接）`);
    }

    // Rebuild search index and title cache
    buildIndex();
    invalidateTitleCache();

    // Record ingestion metadata
    recordIngestion(filename, "success", created, updated);

    return {
      status: "success",
      message: `Processed '${filename}': ${created.length} created, ${updated.length} updated`,
      pagesCreated: created,
      pagesUpdated: updated,
      sourceFile: filename,
    };
  } catch (e: any) {
    recordIngestion(filename, "error", [], []);

    return {
      status: "error",
      message: `Ingestion failed: ${e.message}`,
      pagesCreated: [],
      pagesUpdated: [],
      sourceFile: filename,
    };
  }
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
