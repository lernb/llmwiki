/**
 * Ingestion metadata — tracks which source files have been ingested and when.
 * Stored as a JSON file in the wiki directory.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { WIKI_DIR, SOURCES_DIR } from "../config.js";

const META_FILE = resolve(WIKI_DIR, ".ingest-meta.json");

interface IngestRecord {
  filename: string;
  lastIngested: number;  // timestamp
  pagesCreated: string[];
  pagesUpdated: string[];
  status: "success" | "error";
}

interface IngestMeta {
  records: IngestRecord[];
}

function readMeta(): IngestMeta {
  if (!existsSync(META_FILE)) return { records: [] };
  try {
    return JSON.parse(readFileSync(META_FILE, "utf-8"));
  } catch {
    return { records: [] };
  }
}

function writeMeta(meta: IngestMeta): void {
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2), "utf-8");
}

export function recordIngestion(
  filename: string,
  status: "success" | "error",
  pagesCreated: string[],
  pagesUpdated: string[]
): void {
  const meta = readMeta();
  // Remove old record for this file if exists
  meta.records = meta.records.filter((r) => r.filename !== filename);
  meta.records.push({
    filename,
    lastIngested: Date.now(),
    pagesCreated,
    pagesUpdated,
    status,
  });
  writeMeta(meta);
}

export function getIngestStatus(filename: string): IngestRecord | null {
  const meta = readMeta();
  return meta.records.find((r) => r.filename === filename) || null;
}

export function getAllIngestStatuses(): IngestRecord[] {
  return readMeta().records;
}

export function removeIngestRecord(filename: string): void {
  const meta = readMeta();
  meta.records = meta.records.filter((r) => r.filename !== filename);
  writeMeta(meta);
}

/**
 * Backfill: scan existing wiki pages for "**来源：** filename" references
 * and auto-create ingest records for source files that were processed
 * before the metadata tracking was added.
 *
 * Call this once at startup.
 */
export function backfillIngestMeta(): void {
  const meta = readMeta();
  const existingFilenames = new Set(meta.records.map((r) => r.filename));

  // Get source files on disk
  if (!existsSync(SOURCES_DIR)) return;
  const sourceFiles = new Set(readdirSync(SOURCES_DIR).filter((f) => f.endsWith(".pdf") || f.endsWith(".md") || f.endsWith(".txt")));

  // Scan all wiki pages for source references
  if (!existsSync(WIKI_DIR)) return;
  const wikiFiles = readdirSync(WIKI_DIR).filter((f) => f.endsWith(".md") && f !== ".ingest-meta.json");

  // Build map: source filename → pages that reference it
  const sourceRefMap = new Map<string, string[]>();

  for (const wikiFile of wikiFiles) {
    const content = readFileSync(resolve(WIKI_DIR, wikiFile), "utf-8");
    // Match "**来源：** filename" or "**Source:** filename" patterns
    const sourceMatch = content.match(/\*\*来源：\*\*\s*(.+?)(?:\n|$)/);
    const sourceMatch2 = content.match(/\*\*Source:\*\*\s*(.+?)(?:\n|$)/);
    const ref = sourceMatch?.[1]?.trim() || sourceMatch2?.[1]?.trim();
    if (ref && sourceFiles.has(ref)) {
      const pages = sourceRefMap.get(ref) || [];
      pages.push(wikiFile.replace(/\.md$/, ""));
      sourceRefMap.set(ref, pages);
    }
  }

  let changed = false;
  for (const [filename, pages] of sourceRefMap) {
    if (!existingFilenames.has(filename)) {
      meta.records.push({
        filename,
        lastIngested: Date.now(), // approximate
        pagesCreated: pages.filter((p) => p !== "index"),
        pagesUpdated: pages.includes("index") ? ["index"] : [],
        status: "success",
      });
      changed = true;
    }
  }

  if (changed) {
    writeMeta(meta);
    console.log(`📋 回填消化记录: ${sourceRefMap.size} 个源文件`);
  }
}
