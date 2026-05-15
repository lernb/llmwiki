/**
 * Ingestion metadata — tracks which source files have been ingested and when.
 * Stored as a JSON file in the wiki directory.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { WIKI_DIR } from "../config.js";

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

export function getIngestStatus(
  filename: string
): IngestRecord | null {
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
