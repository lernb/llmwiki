// ─── Types ──────────────────────────────────────────────────────────

export interface PageSummary {
  slug: string;
  title: string;
  size: number;
  updated: number;
}

export interface WikiLink {
  target: string;
  display: string;
  resolved: boolean;
}

export interface Backlink {
  slug: string;
  title: string;
  context: string;
}

export interface PageDetail {
  slug: string;
  title: string;
  content: string;
  links: WikiLink[];
  backlinks: Backlink[];
}

export interface SourceSummary {
  filename: string;
  size: number;
  updated: number;
  ingested: boolean;
  lastIngested: number | null;
  ingestStatus: string | null;
}

export interface SearchHit {
  slug: string;
  title: string;
  snippet: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
  total: number;
}

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

export interface IngestResult {
  status: string;
  message: string;
  pagesCreated: string[];
  pagesUpdated: string[];
  sourceFile: string;
}

export interface QueryResponse {
  answer: string;
  sources: string[];
}

// ─── API Client ─────────────────────────────────────────────────────

const BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Pages
export function getPages(): Promise<PageSummary[]> {
  return fetchJSON("/pages");
}

export function getPage(slug: string): Promise<PageDetail> {
  return fetchJSON(`/pages/${encodeURIComponent(slug)}`);
}

export function putPage(slug: string, content: string): Promise<PageDetail> {
  return fetchJSON(`/pages/${encodeURIComponent(slug)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function deletePage(slug: string): Promise<{ status: string }> {
  return fetchJSON(`/pages/${encodeURIComponent(slug)}`, { method: "DELETE" });
}

// Sources
export function getSources(): Promise<SourceSummary[]> {
  return fetchJSON("/sources");
}

export function uploadSource(file: File): Promise<SourceSummary> {
  const form = new FormData();
  form.append("file", file);
  return fetch(`/api/sources/upload`, {
    method: "POST",
    body: form,
  }).then((r) => {
    if (!r.ok) throw new Error("Upload failed");
    return r.json();
  });
}

export function deleteSource(filename: string): Promise<{ status: string }> {
  return fetchJSON(`/sources/${encodeURIComponent(filename)}`, { method: "DELETE" });
}

// Ingest
export function ingestSource(filename: string): Promise<IngestResult> {
  return fetchJSON("/ingest", {
    method: "POST",
    body: JSON.stringify({ filename }),
  });
}

export function ingestAllSources(): Promise<{ status: string; message: string; results: IngestResult[] }> {
  return fetchJSON("/ingest", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function cancelIngestion(filename: string): Promise<{ status: string }> {
  return fetchJSON(`/ingest/cancel/${encodeURIComponent(filename)}`, { method: "POST" });
}

export function cancelAllIngestions(): Promise<{ status: string; count: number }> {
  return fetchJSON("/ingest/cancel-all", { method: "POST" });
}

// Query
export function queryWiki(question: string): Promise<QueryResponse> {
  return fetchJSON("/query", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

// Search
export function searchWiki(q: string): Promise<SearchResponse> {
  return fetchJSON(`/search?q=${encodeURIComponent(q)}`);
}

// Graph
export function getGraph(): Promise<GraphData> {
  return fetchJSON("/graph");
}

// Health
export function healthCheck(): Promise<{ status: string; version: string }> {
  return fetchJSON("/health");
}
