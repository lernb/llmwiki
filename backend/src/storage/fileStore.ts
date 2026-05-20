import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

import { WIKI_DIR, SOURCES_DIR } from "../config.js";

// ─── Wiki Pages ─────────────────────────────────────────────────────

function pagePath(slug: string): string {
  return resolve(WIKI_DIR, `${slug}.md`);
}

export function slugFromTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, "-").replace(/\//g, "-");
}

export function listPages(): Array<{ slug: string; title: string; size: number; updated: number }> {
  const pages: Array<{ slug: string; title: string; size: number; updated: number }> = [];
  if (!existsSync(WIKI_DIR)) return pages;

  for (const entry of readdirSync(WIKI_DIR)) {
    if (!entry.endsWith(".md")) continue;
    const slug = basename(entry, ".md");
    const fullPath = resolve(WIKI_DIR, entry);
    const stat = statSync(fullPath);
    pages.push({
      slug,
      title: titleFromFile(fullPath) || slug,
      size: stat.size,
      updated: stat.mtimeMs,
    });
  }
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function readPage(slug: string): string | null {
  const path = pagePath(slug);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function writePage(slug: string, content: string): string {
  const path = pagePath(slug);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf-8");
  return path;
}

export function deletePage(slug: string): boolean {
  const path = pagePath(slug);
  if (existsSync(path)) {
    unlinkSync(path);
    return true;
  }
  return false;
}

export function pageExists(slug: string): boolean {
  return existsSync(pagePath(slug));
}

export function allMarkdownText(): string {
  const parts: string[] = [];
  if (!existsSync(WIKI_DIR)) return "";
  for (const entry of readdirSync(WIKI_DIR).sort()) {
    if (!entry.endsWith(".md")) continue;
    parts.push(readFileSync(resolve(WIKI_DIR, entry), "utf-8"));
  }
  return parts.join("\n\n");
}

// ─── Source Files ────────────────────────────────────────────────────

export function saveSource(filename: string, content: Buffer | string): string {
  const safeFilename = basename(filename);
  const path = resolve(SOURCES_DIR, safeFilename);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
}

export function listSources(): Array<{ filename: string; size: number; updated: number }> {
  const sources: Array<{ filename: string; size: number; updated: number }> = [];
  if (!existsSync(SOURCES_DIR)) return sources;

  for (const entry of readdirSync(SOURCES_DIR)) {
    const fullPath = resolve(SOURCES_DIR, entry);
    const stat = statSync(fullPath);
    if (stat.isFile()) {
      sources.push({
        filename: entry,
        size: stat.size,
        updated: stat.mtimeMs,
      });
    }
  }
  return sources.sort((a, b) => a.filename.localeCompare(b.filename));
}

/** Read source file content as text. Supports PDF extraction. */
export async function readSource(filename: string): Promise<string | null> {
  const safeFilename = basename(filename);
  const path = resolve(SOURCES_DIR, safeFilename);
  if (!existsSync(path)) return null;

  if (filename.toLowerCase().endsWith(".pdf")) {
    return await extractPdfText(path, filename);
  }

  try {
    return readFileSync(path, "utf-8");
  } catch {
    return `[Binary file: ${filename}, ${statSync(path).size} bytes]`;
  }
}

async function extractPdfText(path: string, filename: string): Promise<string | null> {
  try {
    const dataBuffer = readFileSync(path);
    const pdfParse = _require("pdf-parse");
    const data = await pdfParse(dataBuffer);
    const text = (data.text || "").trim();
    if (text.length < 20) {
      return `[PDF: ${filename}, ${(statSync(path).size / 1024).toFixed(0)} KB — 未能提取文字内容]`;
    }
    return text;
  } catch (e: any) {
    return `[PDF解析失败: ${e.message}]`;
  }
}

export function deleteSource(filename: string): boolean {
  const safeFilename = basename(filename);
  const path = resolve(SOURCES_DIR, safeFilename);
  if (existsSync(path)) {
    unlinkSync(path);
    return true;
  }
  return false;
}

// ─── Internal ────────────────────────────────────────────────────────

function titleFromFile(path: string): string | null {
  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      return trimmed.slice(2).trim();
    }
  }
  return null;
}

export function titleFromSlug(slug: string): string | null {
  const path = resolve(WIKI_DIR, `${slug}.md`);
  if (!existsSync(path)) return null;
  return titleFromFile(path);
}
